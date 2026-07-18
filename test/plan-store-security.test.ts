import { expect, test } from "bun:test";
import { link, lstat, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { planningDigest } from "../src/planning-canonical";
import {
  PlanStoreLockError,
  PlanStorePathError,
  acquirePlanLock,
  appendPlannerLocalEvent,
  consumeCurrentChallenge,
  loadOrCreateReceiptSecret,
  planArtifactPath,
  planRunPath,
  readPlanArtifact,
  releasePlanLock,
  writeCurrentChallenge,
  writeFinalReceiptAtRevision,
  writePlanArtifact,
  writePlanMetrics
} from "../src/plan-store";

const runId = "123e4567-e89b-42d3-a456-426614174000";

async function workspace(): Promise<string> {
  return mkdtemp(join(tmpdir(), "boulder-plan-store-"));
}
const digest = (letter: string) => `sha256:${letter.repeat(64)}`;
function challengeContent(status: "pending" | "consumed", overrides: Record<string, unknown> = {}): string {
  const base = {
    schemaVersion: "boulder.plan-approval-challenge.v1",
    runId: "Run_ID.1",
    purpose: "plan",
    createdAt: "2026-07-15T12:00:00Z",
    challengeId: "challenge_1",
    status,
    nonce: "nonce_1",
    codeHash: digest("b"),
    keyVersion: "key_1",
    issuedBy: "plan-review",
    bindings: { packetDigest: digest("c"), structuralReviewDigest: digest("d"), semanticReviewDigest: digest("e"), sourceDigest: digest("f") },
    ...overrides
  };
  return JSON.stringify({ ...base, challengeDigest: planningDigest(base) });
}
function receiptContent(challenge: Record<string, unknown>, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: "boulder.plan-approval.v1",
    runId: challenge.runId,
    purpose: "plan",
    challengeDigest: challenge.challengeDigest,
    nonce: challenge.nonce,
    codeHash: challenge.codeHash,
    keyVersion: challenge.keyVersion,
    bindings: challenge.bindings,
    approvedAt: "2026-07-15T12:01:00Z",
    approvalScope: "plan-only",
    signaturePurpose: "boulder.plan.approval.v1",
    signature: "a".repeat(64),
    ...overrides
  });
}
async function issueAndConsumeChallenge(root: string, revision = 1): Promise<Record<string, unknown>> {
  const pending = challengeContent("pending");
  const parsedPending = JSON.parse(pending) as Record<string, unknown>;
  await writeCurrentChallenge(root, "Run_ID.1", "plan", { expectedRevision: revision, challengeDigest: parsedPending.challengeDigest as string, content: pending });
  const consumedRecord = { ...JSON.parse(challengeContent("consumed")) as Record<string, unknown>, challengeDigest: parsedPending.challengeDigest };
  const consumed = JSON.stringify(consumedRecord);
  const parsedConsumed = consumedRecord;
  await consumeCurrentChallenge(root, "Run_ID.1", "plan", {
    expectedRevision: revision,
    expectedChallengeDigest: parsedPending.challengeDigest as string,
    challengeDigest: parsedConsumed.challengeDigest as string,
    content: consumed
  });
  return parsedConsumed;
}

test("rejects absolute and traversal artifact paths before writing", async () => {
  const root = await workspace();
  try {
    for (const artifact of ["/outside.json", "../outside.json", "nested/../../outside.json"]) {
      let message = "";
      try { planArtifactPath(root, runId, artifact); } catch (error) { message = error instanceof Error ? error.message : String(error); }
      expect(message).toContain("Plan artifact path");
    }
    expect(planRunPath(root, "safe-run")).toContain(".boulder/plans/safe-run");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects hostile symlink and hardlink topology without replacing artifacts", async () => {
  const root = await workspace();
  const outside = join(root, "outside.json");
  try {
    await writeFile(outside, "outside", "utf8");
    const run = planRunPath(root, runId);
    await writePlanArtifact(root, runId, "state.json", "first");
    await unlink(join(run, "state.json"));
    await symlink(outside, join(run, "state.json"));
    await expect(writePlanArtifact(root, runId, "state.json", "replace")).rejects.toThrow("Plan artifact path");
    expect(await readFile(outside, "utf8")).toBe("outside");
    await unlink(join(run, "state.json"));
    await link(outside, join(run, "state.json"));
    await expect(writePlanArtifact(root, runId, "state.json", "replace")).rejects.toThrow("Plan artifact path");
    expect(await readFile(outside, "utf8")).toBe("outside");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("atomically replaces regular artifacts and rejects a swapped run root", async () => {
  const root = await workspace();
  try {
    await writePlanArtifact(root, runId, "state.json", "old");
    await writePlanArtifact(root, runId, "state.json", "new");
    expect(await readFile(planArtifactPath(root, runId, "state.json"), "utf8")).toBe("new");
    const run = planRunPath(root, runId);
    await rm(run, { recursive: true });
    await symlink(root, run);
    await expect(writePlanArtifact(root, runId, "state.json", "unsafe")).rejects.toThrow("unsafe");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uses exclusive locks and only unlocks the expected owner and revision", async () => {
  const root = await workspace();
  const owner = { owner: "writer-a", revision: 2 };
  try {
    await acquirePlanLock(root, runId, owner);
    await expect(acquirePlanLock(root, runId, { owner: "writer-b", revision: 2 })).rejects.toThrow("locked");
    await expect(releasePlanLock(root, runId, { owner: "writer-a", revision: 3 })).rejects.toThrow("ownership or revision changed");
    await releasePlanLock(root, runId, owner);
    await acquirePlanLock(root, runId, { owner: "writer-b", revision: 2 });
    const info = await lstat(planArtifactPath(root, runId, "lock"));
    expect(info.isFile()).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("persists only allowlisted versioned planner event metadata", async () => {
  const root = await workspace();
  const slug = "planner-run-1";
  const event = {
    schemaVersion: "boulder.planner-local-event.v1" as const,
    kind: "planner.preview.recommended" as const,
    status: "recommended" as const,
    revision: 1,
    occurredAt: "2026-07-15T12:00:00Z",
    artifactDigest: digest("a"),
    durationMs: 12
  };
  try {
    await writePlanArtifact(root, slug, "history/challenge.json", "saved");
    expect(await readPlanArtifact(root, slug, "history/challenge.json")).toBe("saved");
    const secret = await loadOrCreateReceiptSecret(root, slug);
    expect(await loadOrCreateReceiptSecret(root, slug)).toBe(secret);
    await appendPlannerLocalEvent(root, slug, event);
    expect(await readFile(planArtifactPath(root, slug, "events.jsonl"), "utf8")).toBe(`${JSON.stringify(event)}\n`);

    for (const attack of [
      { ...event, rawTask: "raw task" },
      { ...event, prompt: "raw prompt" },
      { ...event, message: "raw message" },
      { ...event, content: "raw content" },
      { ...event, text: "raw text" },
      { ...event, task: "raw task" },
      { ...event, body: "raw body" },
      { ...event, metadata: { rawTask: "nested raw task" } }
    ]) {
      await expect(appendPlannerLocalEvent(root, slug, attack)).rejects.toThrow("Planner event metadata is invalid");
    }
    await expect(appendPlannerLocalEvent(root, slug, { ...event, status: "failed" })).rejects.toThrow("Planner event metadata is invalid");
    await writePlanMetrics(root, slug, { approvals: 1, revisions: 2 });
    expect(await readFile(planArtifactPath(root, slug, "metrics.json"), "utf8")).toContain("\"approvals\":1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("accepts frozen safe run IDs and leaves identical challenge issuance unchanged", async () => {
  const root = await workspace();
  const explicitId = "Run_ID.1";
  const content = challengeContent("pending");
  const challenge = JSON.parse(content) as Record<string, unknown>;
  try {
    expect(planRunPath(root, explicitId)).toContain(`.boulder/plans/${explicitId}`);
    await writeCurrentChallenge(root, explicitId, "plan", { expectedRevision: 4, challengeDigest: challenge.challengeDigest as string, content });
    await writeCurrentChallenge(root, explicitId, "plan", { expectedRevision: 4, challengeDigest: challenge.challengeDigest as string, content });
    expect(await readPlanArtifact(root, explicitId, "challenges/plan.json")).toBe(content);
    expect(await readPlanArtifact(root, explicitId, `history/plan-${String(challenge.challengeDigest).slice("sha256:".length)}.json`)).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("final receipts reject pending, malformed, and mismatched challenges without creating a receipt", async () => {
  const root = await workspace();
  try {
    const pending = challengeContent("pending");
    const parsedPending = JSON.parse(pending) as Record<string, unknown>;
    await writeCurrentChallenge(root, "Run_ID.1", "plan", { expectedRevision: 5, challengeDigest: parsedPending.challengeDigest as string, content: pending });
    await expect(writeFinalReceiptAtRevision(root, "Run_ID.1", "plan", 5, receiptContent(parsedPending))).rejects.toThrow("Final receipt");
    expect(await readPlanArtifact(root, "Run_ID.1", "receipts/plan.json")).toBeNull();

    await writePlanArtifact(root, "Run_ID.1", "challenges/plan.json", "{malformed");
    await expect(writeFinalReceiptAtRevision(root, "Run_ID.1", "plan", 5, receiptContent(parsedPending))).rejects.toThrow("Persisted challenge");
    expect(await readPlanArtifact(root, "Run_ID.1", "receipts/plan.json")).toBeNull();
    await writePlanArtifact(root, "Run_ID.1", "challenges/plan.json", pending);

    const consumed = await issueAndConsumeChallenge(root, 5);
    await expect(writeFinalReceiptAtRevision(root, "Run_ID.1", "plan", 5, receiptContent(consumed, { nonce: "other_nonce" }))).rejects.toThrow("does not match");
    expect(await readPlanArtifact(root, "Run_ID.1", "receipts/plan.json")).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writes a matching final receipt only after consumption", async () => {
  const root = await workspace();
  try {
    const consumed = await issueAndConsumeChallenge(root, 6);
    const receipt = receiptContent(consumed);
    await writeFinalReceiptAtRevision(root, "Run_ID.1", "plan", 6, receipt);
    expect(await readPlanArtifact(root, "Run_ID.1", "receipts/plan.json")).toBe(receipt);
    expect(await readPlanArtifact(root, "Run_ID.1", `history/plan-${String(consumed.challengeDigest).slice("sha256:".length)}.json`)).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
