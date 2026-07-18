import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { joinPlannerCriticReviews } from "../src/planner-critic";
import { createCriticReviewAttestation, type CriticReview, type CriticReviewerAuthority } from "../src/critic-review";
import type { PlanningPacket } from "../src/planning-packet";

async function packet(): Promise<PlanningPacket> {
  return JSON.parse(await readFile(join(import.meta.dir, "..", "fixtures", "planning-packets", "valid.json"), "utf8")) as PlanningPacket;
}

function authority(reviewType: CriticReview["reviewType"]): CriticReviewerAuthority {
  return { reviewType, adapter: `${reviewType}-critic`, host: "local", toolVersion: "1.0.0", issuer: `${reviewType}-authority`, keyId: `${reviewType}-key-1`, secret: `${reviewType}-secret` };
}

function review(reviewType: CriticReview["reviewType"], packetDigest: string): CriticReview {
  const base: Omit<CriticReview, "attestation"> = {
    schemaVersion: "boulder.critic-review.v1",
    reviewType,
    packetDigest,
    verdict: "PASS",
    findings: [],
    coverage: ["schema", "scope", "traceability"],
    reviewer: { adapter: `${reviewType}-critic`, host: "local", toolVersion: "1.0.0", independentFromProducer: true },
    createdAt: "2026-07-15T12:00:00Z"
  };
  return { ...base, attestation: createCriticReviewAttestation(base, authority(reviewType)) };
}

function authorities(): readonly CriticReviewerAuthority[] {
  return [authority("structural"), authority("semantic")];
}

async function input() {
  const currentPacket = await packet();
  return {
    packet: currentPacket,
    reviews: [review("structural", currentPacket.packetDigest), review("semantic", currentPacket.packetDigest)],
    reviewerAuthorities: authorities(),
    unresolvedFindings: [],
    iteration: 0,
    sourceDrift: false
  } as const;
}

test("joins trusted current structural and semantic PASS receipts deterministically", async () => {
  const value = await input();
  const first = joinPlannerCriticReviews(value);
  const second = joinPlannerCriticReviews(value);
  expect(first).toEqual(second);
  expect({ status: first.status, packetDigest: first.packetDigest, issues: first.issues }).toEqual({ status: "PASS", packetDigest: value.packet.packetDigest, issues: [] });
});

test("cannot suppress a blocking finding embedded in a joined review", async () => {
  const value = await input();
  const base = { ...value.reviews[0], findings: [{ id: "F1", severity: "high" as const, category: "safety", statement: "unsafe", evidenceRefs: ["S1"], requiredChange: "fix" }] };
  const structural = { ...base, attestation: createCriticReviewAttestation(base, authority("structural")) };
  const result = joinPlannerCriticReviews({ ...value, reviews: [structural, value.reviews[1]], unresolvedFindings: [] });
  expect(result.status).toBe("ITERATE");
  expect(result.issues.map((issue) => issue.id)).toContain("plan.review.required");
});

test("rejects stale receipts, forged attestation, and wrong configured authority", async () => {
  const value = await input();
  const stale = joinPlannerCriticReviews({ ...value, reviews: [value.reviews[0], { ...value.reviews[1], packetDigest: `sha256:${"b".repeat(64)}` }] });
  expect(stale.issues.map((issue) => issue.id)).toContain("plan.review.stale");
  const forged = joinPlannerCriticReviews({ ...value, reviews: [{ ...value.reviews[0], attestation: { ...value.reviews[0].attestation, signature: "0".repeat(64) } }, value.reviews[1]] });
  expect(forged.issues.map((issue) => issue.id)).toContain("plan.review.authority");
  const wrongAuthority = joinPlannerCriticReviews({ ...value, reviewerAuthorities: [{ ...authorities()[0], adapter: "other" }, authorities()[1]] });
  expect(wrongAuthority.issues.map((issue) => issue.id)).toContain("plan.review.authority");
});

test("does not mutate the planning packet or join mismatched review sets", async () => {
  const value = await input();
  const before = JSON.stringify(value.packet);
  const mismatch = joinPlannerCriticReviews({ ...value, reviews: [value.reviews[0]] });
  expect(JSON.stringify(value.packet)).toBe(before);
  expect(mismatch.status).toBe("ITERATE");
  expect(mismatch.issues.map((issue) => issue.id)).toContain("plan.review.required");
});

test("caps automated revisions at three with the stable iteration error", async () => {
  const value = await input();
  const result = joinPlannerCriticReviews({ ...value, iteration: 4 });
  expect(result.status).toBe("REJECT");
  expect(result.issues.some((issue) => issue.id === "plan.review.iteration_limit" && issue.path === "iteration")).toBe(true);
});
