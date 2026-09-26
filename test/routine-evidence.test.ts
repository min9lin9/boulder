import { link, readFile, readdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import * as bunTest from "bun:test";
import { acquire, WriterBusyError } from "../src/evidence-write-lock";
import { evidenceDescriptorHash, type EvidenceDescriptor } from "../src/evidence/descriptors";
import * as writes from "../src/fs";
import { attachRoutineEvidence, captureRoutine, isRoutineArtifact } from "../src/routine";
import { removeTempRepo, runBoulder, sha256Hex, tempRepo, write } from "./helpers/cli";

const { describe, expect, test } = bunTest;
const { spyOn } = bunTest as unknown as {
  spyOn<T, K extends keyof T>(target: T, method: K): {
    mockImplementation(implementation: T[K]): void;
    mockRestore(): void;
  };
};
const task = "review failures";
const id = "review-failures";
const artifactPath = `.boulder/routines/${id}.json`;
const descriptorPath = ".boulder/evidence/traces/review.json";
const selection = { task: id, ordinal: 1, descriptorKind: "traces", descriptorId: "review" };
const flags = ["--task", id, "--ordinal", "1", "--descriptor-kind", "traces", "--descriptor-id", "review"];
const manualRef = { kind: "manual", path: ".boulder/runs/review.json" };
// Stored refs carry the authenticated descriptor hash; recompute it like the
// attach path does instead of trusting a hardcoded digest.
const tracesRef = async (): Promise<Record<string, unknown>> => ({
  kind: "traces", path: descriptorPath, hash: (await descriptor()).hash as string
});
const content: Omit<EvidenceDescriptor, "hash"> = {
  schema_version: "boulder.evidence-descriptor.v1",
  descriptor_id: "review",
  descriptor_kind: "traces",
  descriptor_path: descriptorPath,
  createdAt: "2026-09-25T00:00:00.000Z"
};

// Independent fixture hashing: this descriptor's payload contains only strings.
async function descriptor(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const payload = { ...content, ...overrides };
  return { ...payload, hash: `sha256:${await sha256Hex(JSON.stringify(Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))))}` };
}
async function capture(root: string): Promise<Record<string, unknown>> {
  const result = await runBoulder(["routine", "capture", "--task", task, "--write", "--json", "--cwd", root]);
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toBe("");
  return JSON.parse(await readFile(join(root, artifactPath), "utf8"));
}
async function add(root: string, options = flags) {
  return runBoulder(["routine", "evidence", "add", ...options, "--json", "--cwd", root]);
}
async function putDescriptor(root: string, value: unknown = undefined): Promise<void> {
  await write(root, descriptorPath, JSON.stringify(value ?? await descriptor(), null, 2) + "\n");
}
async function assertRefused(root: string, code: string, options = flags): Promise<void> {
  const before = await readFile(join(root, artifactPath), "utf8");
  const result = await add(root, options);
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim()).toMatch(new RegExp(`^ERROR ${code.replaceAll(".", "\\.")}: [^\\r\\n]+$`));
  expect(await readFile(join(root, artifactPath), "utf8")).toBe(before);
  expect(await readdir(join(root, ".boulder/routines"))).toEqual([`${id}.json`]);
  expect(await readdir(join(root, ".boulder/trace-state"))).toEqual([]);
}

describe("routine evidence add through the CLI", () => {
  test("attaches, dedupes, preserves old metadata, and survives repeat capture", async () => {
    const root = await tempRepo();
    try {
      const original = await capture(root);
      original.evidenceRefs = [manualRef];
      original.extraMetadata = "preserved";
      await write(root, artifactPath, JSON.stringify(original));
      await putDescriptor(root);
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await add(root);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(JSON.parse(result.stdout)).toEqual({ status: "attached", artifact_path: artifactPath, evidence_refs: [manualRef.path, descriptorPath] });
        expect(JSON.parse(await readFile(join(root, artifactPath), "utf8"))).toEqual({ ...original, evidenceRefs: [manualRef, await tracesRef()] });
      }
      const recaptured = await capture(root);
      expect(Object.hasOwn(recaptured, "evidence_refs")).toBe(false);
      expect(recaptured.evidenceRefs).toEqual([manualRef, await tracesRef()]);
      expect(recaptured.createdAt).toBe(original.createdAt);
      expect(recaptured.seenCount).toBe(2);
      expect(await readdir(join(root, ".boulder/routines"))).toEqual([`${id}.json`]);
      expect(await readdir(join(root, ".boulder/trace-state"))).toEqual([]);
    } finally { await removeTempRepo(root); }
  });

  test("accepts an absolute normalized descriptor path and stores a portable reference", async () => {
    const root = await tempRepo();
    try {
      await capture(root);
      const absolute = await descriptor({ descriptor_path: join(root, descriptorPath) });
      await putDescriptor(root, absolute);
      const result = await add(root);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).evidence_refs).toEqual([descriptorPath]);
      const stored = JSON.parse(await readFile(join(root, artifactPath), "utf8"));
      expect(Object.hasOwn(stored, "evidence_refs")).toBe(false);
      expect(stored.evidenceRefs).toEqual([{ kind: "traces", path: descriptorPath, hash: absolute.hash }]);
    } finally { await removeTempRepo(root); }
  });

  test("adds a second descriptor without imposing trace lineage or changing the first", async () => {
    const root = await tempRepo();
    try {
      await capture(root);
      await putDescriptor(root);
      expect((await add(root)).exitCode).toBe(0);
      const otherPath = ".boulder/evidence/manual/qa.json";
      await write(root, otherPath, JSON.stringify(await descriptor({
        descriptor_id: "qa", descriptor_kind: "manual", descriptor_path: otherPath
      })));
      const result = await add(root, ["--task", id, "--ordinal", "1", "--descriptor-kind", "manual", "--descriptor-id", "qa"]);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).evidence_refs).toEqual([descriptorPath, otherPath]);
    } finally { await removeTempRepo(root); }
  });

  test("old artifacts without evidence_refs remain readable by existing consumers", async () => {
    const root = await tempRepo();
    try {
      const old = await capture(root);
      expect(Object.hasOwn(old, "evidence_refs")).toBe(false);
      expect(isRoutineArtifact(old)).toBe(true);
      const proposal = await runBoulder(["skill", "propose", "--from-routine", id, "--dry-run", "--json", "--cwd", root]);
      expect(proposal.exitCode).toBe(0);
      await putDescriptor(root);
      expect((await add(root)).exitCode).toBe(0);
      const stored = JSON.parse(await readFile(join(root, artifactPath), "utf8"));
      expect(isRoutineArtifact(stored)).toBe(true);
      expect(Object.hasOwn(stored, "evidence_refs")).toBe(false);
      expect(isRoutineArtifact({ ...old, evidence_refs: [7] })).toBe(false);
    } finally { await removeTempRepo(root); }
  });

  test("artifacts written by the buggy dual-field build still read correctly", async () => {
    const root = await tempRepo();
    try {
      // Simulate the buggy build: a stray snake_case twin holds the real ref
      // while the canonical camelCase field is empty.
      const buggy = await capture(root);
      buggy.evidence_refs = [".boulder/evidence/manual/qa-checks.json"];
      await write(root, artifactPath, JSON.stringify(buggy));
      expect(isRoutineArtifact(buggy)).toBe(true);
      // Consumers read through the merged view even before any rewrite.
      const proposal = await runBoulder(["skill", "propose", "--from-routine", id, "--dry-run", "--json", "--cwd", root]);
      expect(proposal.exitCode).toBe(0);
      expect(JSON.parse(proposal.stdout).markdown).toContain("kind=manual path=.boulder/evidence/manual/qa-checks.json");
      // Attach merges the stray field into the canonical field and drops it.
      await putDescriptor(root);
      const result = await add(root);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).evidence_refs).toEqual([".boulder/evidence/manual/qa-checks.json", descriptorPath]);
      const stored = JSON.parse(await readFile(join(root, artifactPath), "utf8"));
      expect(Object.keys(stored).filter((key) => key.startsWith("evidence"))).toEqual(["evidenceRefs"]);
      expect(stored.evidenceRefs).toEqual([
        { kind: "manual", path: ".boulder/evidence/manual/qa-checks.json" },
        await tracesRef()
      ]);
      // Repeat capture keeps the migrated refs under the single canonical field.
      const recaptured = await capture(root);
      expect(Object.keys(recaptured).filter((key) => key.startsWith("evidence"))).toEqual(["evidenceRefs"]);
      expect(recaptured.evidenceRefs).toEqual(stored.evidenceRefs);
    } finally { await removeTempRepo(root); }
  });

  for (const flag of ["--task", "--ordinal", "--descriptor-kind", "--descriptor-id"]) {
    test(`requires an explicit ${flag}`, async () => {
      const root = await tempRepo();
      try {
        await capture(root);
        await putDescriptor(root);
        const options = flags.filter((_, index) => index !== flags.indexOf(flag) && index !== flags.indexOf(flag) + 1);
        await assertRefused(root, "routine.evidence_option_required", options);
        await assertRefused(root, "routine.evidence_option_required", [...options, flag]);
        await assertRefused(root, "routine.evidence_option_required", [...flags, flag, "ambiguous"]);
      } finally { await removeTempRepo(root); }
    });
  }

  test("refuses a missing descriptor rather than inventing a latest descriptor", async () => {
    const root = await tempRepo();
    try {
      await capture(root);
      await assertRefused(root, "evidence.descriptor_missing");
    } finally { await removeTempRepo(root); }
  });

  test("refuses malformed JSON", async () => {
    const root = await tempRepo();
    try {
      await capture(root);
      await write(root, descriptorPath, "{broken");
      await assertRefused(root, "evidence.descriptor_invalid");
    } finally { await removeTempRepo(root); }
  });

  for (const field of ["schema_version", "descriptor_id", "descriptor_kind", "descriptor_path", "hash", "createdAt"]) {
    test(`refuses missing descriptor field ${field}`, async () => {
      const root = await tempRepo();
      try {
        await capture(root);
        const value = await descriptor();
        delete value[field];
        await putDescriptor(root, value);
        await assertRefused(root, "evidence.descriptor_invalid");
      } finally { await removeTempRepo(root); }
    });
  }

  for (const [field, value] of [
    ["schema_version", "boulder.evidence-descriptor.v2"], ["descriptor_id", "another"],
    ["descriptor_kind", "manual"], ["createdAt", "not-a-date"], ["descriptor_path", 42]
  ] as const) {
    test(`refuses mismatched or malformed ${field}`, async () => {
      const root = await tempRepo();
      try {
        await capture(root);
        await putDescriptor(root, await descriptor({ [field]: value }));
        await assertRefused(root, "evidence.descriptor_invalid");
      } finally { await removeTempRepo(root); }
    });
  }

  test("recomputes canonical file content instead of trusting hash, including additional metadata", async () => {
    const root = await tempRepo();
    try {
      await capture(root);
      for (const [hash, code] of [["bad", "evidence.descriptor_invalid"], [`sha256:${"0".repeat(64)}`, "evidence.hash_mismatch"]]) {
        await putDescriptor(root, { ...await descriptor(), hash });
        await assertRefused(root, code);
      }
      await putDescriptor(root, { ...await descriptor(), extra: "tampered" });
      await assertRefused(root, "evidence.hash_mismatch");
      expect(await evidenceDescriptorHash(content)).toBe((await descriptor()).hash);
      // JSON formatting/key ordering are not part of canonical bytes.
      const value = await descriptor();
      await write(root, descriptorPath, JSON.stringify(Object.fromEntries(Object.entries(value).reverse())));
      expect((await add(root)).exitCode).toBe(0);
    } finally { await removeTempRepo(root); }
  });

  for (const path of [
    "../outside.json", ".boulder/evidence/traces/../traces/review.json", "/tmp/outside.json",
    ".boulder/evidence/traces/wrong.json", ".boulder/runs/review.json", ".boulder//evidence/traces/review.json",
    "./.boulder/evidence/traces/review.json", ".boulder\\evidence\\traces\\review.json"
  ]) {
    test(`refuses descriptor_path ${path}`, async () => {
      const root = await tempRepo();
      try {
        await capture(root);
        await putDescriptor(root, await descriptor({ descriptor_path: path }));
        await assertRefused(root, "evidence.path_invalid");
      } finally { await removeTempRepo(root); }
    });
  }

  test("accepts the plan-required 'trace' descriptor kind and stores hash plus --note", async () => {
    const root = await tempRepo();
    try {
      await capture(root);
      const tracePath = ".boulder/evidence/trace/pinned.json";
      const value = await descriptor({
        descriptor_id: "pinned", descriptor_kind: "trace", descriptor_path: tracePath
      });
      await write(root, tracePath, JSON.stringify(value, null, 2) + "\n");
      const result = await add(root, ["--task", id, "--ordinal", "1", "--descriptor-kind", "trace",
        "--descriptor-id", "pinned", "--note", "  pinned   span for review  "]);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout).evidence_refs).toEqual([tracePath]);
      const stored = JSON.parse(await readFile(join(root, artifactPath), "utf8"));
      expect(stored.evidenceRefs).toEqual([
        { kind: "trace", path: tracePath, hash: value.hash, note: "pinned span for review" }
      ]);
      for (const options of [
        [...flags, "--note"],
        [...flags, "--note", "a", "--note", "b"],
        [...flags, "--note", "  "]
      ]) {
        await assertRefused(root, "routine.evidence_note_invalid", options);
      }
    } finally { await removeTempRepo(root); }
  });

  test("rejects unsupported ordinals, unsafe identities, and dry-run without writing", async () => {
    const root = await tempRepo();
    try {
      await capture(root);
      await putDescriptor(root);
      for (const ordinal of ["0", "2", "-1", "1.0", "1e0", "9007199254740992"]) {
        await assertRefused(root, "routine.ordinal_invalid", flags.map((value, index) => index === 3 ? ordinal : value));
      }
      await assertRefused(root, "routine.invalid_task", flags.map((value, index) => index === 1 ? "../escape" : value));
      for (const index of [5, 7]) {
        await assertRefused(root, "evidence.identity_invalid", flags.map((value, position) => position === index ? "../escape" : value));
      }
      await assertRefused(root, "routine.mode_conflict", [...flags, "--dry-run"]);
    } finally { await removeTempRepo(root); }
  });

  test("refuses malformed or identity-mismatched routine artifacts without replacing them", async () => {
    const root = await tempRepo();
    try {
      const old = await capture(root);
      await putDescriptor(root);
      for (const value of ["{broken", JSON.stringify({ ...old, schemaVersion: 2 }), JSON.stringify({ ...old, id: "other" })]) {
        await write(root, artifactPath, value);
        await assertRefused(root, "routine.artifact_invalid");
      }
      await rm(join(root, artifactPath));
      const result = await add(root);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("ERROR routine.artifact_missing:");
      expect(await readdir(join(root, ".boulder/routines"))).toEqual([]);
    } finally { await removeTempRepo(root); }
  });

  for (const target of [".boulder/evidence", ".boulder/evidence/traces", descriptorPath]) {
    test(`refuses a symlink at ${target}`, async () => {
      const root = await tempRepo();
      const outside = await tempRepo();
      try {
        await capture(root);
        await putDescriptor(root);
        await write(outside, "review.json", JSON.stringify(await descriptor()));
        await rm(join(root, target), { recursive: true });
        await symlink(target === descriptorPath ? join(outside, "review.json") : outside, join(root, target));
        await assertRefused(root, "evidence.path_invalid");
      } finally { await removeTempRepo(root); await removeTempRepo(outside); }
    });
  }

  test("refuses hardlinked descriptor and routine files", async () => {
    const root = await tempRepo();
    try {
      await capture(root);
      await putDescriptor(root);
      await link(join(root, descriptorPath), join(root, "descriptor-link.json"));
      await assertRefused(root, "evidence.path_invalid");
      await rm(join(root, "descriptor-link.json"));
      await link(join(root, artifactPath), join(root, "routine-link.json"));
      await assertRefused(root, "routine.path_invalid");
    } finally { await removeTempRepo(root); }
  });

  test("held lock produces a real nonzero writer_busy before reading either artifact", async () => {
    const root = await tempRepo();
    try {
      await capture(root);
      const writer = await acquire(root, { command: "other writer" });
      try {
        await write(root, artifactPath, "{writer-in-progress");
        const result = await add(root);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr.trim()).toMatch(/^ERROR trace\.writer_busy: [^\r\n]+$/);
        expect(await readFile(join(root, artifactPath), "utf8")).toBe("{writer-in-progress");
        expect(JSON.parse(await readFile(join(writer.path, "owner.json"), "utf8"))).toEqual(writer.owner);
      } finally { await writer.release(); }
    } finally { await removeTempRepo(root); }
  });
});

function signal(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Evidence write barrier was not reached")), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

test("attachment holds the shared lock through atomic replacement and releases it on failure", async () => {
  const root = await tempRepo();
  const path = join(root, artifactPath);
  const reached = signal();
  const resume = signal();
  const safeReplaceText = writes.safeReplaceText;
  const writeSpy = spyOn(writes, "safeReplaceText");
  const failure = new Error("injected write failure");
  let fail = false;
  writeSpy.mockImplementation(async (target, text) => {
    if (target === path) {
      reached.resolve();
      await resume.promise;
      if (fail) throw failure;
    }
    await safeReplaceText(target, text);
  });
  try {
    await capture(root);
    await putDescriptor(root);
    const before = await readFile(path, "utf8");
    const operation = attachRoutineEvidence(root, selection);
    const prematurelyDone = operation.then(() => { throw new Error("Attachment bypassed its write barrier"); });
    try {
      await bounded(Promise.race([reached.promise, prematurelyDone]));
      expect(await readFile(path, "utf8")).toBe(before);
      const competing = await captureRoutine(root, task, "programming-default", true).then(() => null, (error: unknown) => error);
      expect(competing instanceof WriterBusyError).toBe(true);
    } finally { resume.resolve(); await operation; }
    const written = JSON.parse(await readFile(path, "utf8"));
    expect(Object.hasOwn(written, "evidence_refs")).toBe(false);
    expect(written.evidenceRefs).toEqual([await tracesRef()]);
    const attached = await readFile(path, "utf8");
    fail = true;
    const error = await attachRoutineEvidence(root, selection).then(() => null, (error: unknown) => error);
    expect(error).toBe(failure);
    expect(await readFile(path, "utf8")).toBe(attached);
    expect(await readdir(join(root, ".boulder/routines"))).toEqual([`${id}.json`]);
    const writer = await acquire(root, { command: "after failed write" });
    await writer.release();
  } finally {
    resume.resolve();
    writeSpy.mockRestore();
    await removeTempRepo(root);
  }
});
