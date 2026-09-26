import { describe, expect, test } from "bun:test";
import { readFile, readdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { acquire } from "../src/evidence-write-lock";
import { collectSession, snapshotDigest } from "../src/trace/collect";
import type { InputObservation, SessionSnapshot } from "../src/trace/contracts";
import { loadHead, type SegmentHeader, type TraceHead } from "../src/trace/journal";
import type { TraceVerifyReport } from "../src/trace/verify";
import { removeTempRepo, runBoulder, sha256Hex, tempRepo, write } from "./helpers/cli";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type SnapshotRecord = Omit<Mutable<SessionSnapshot>, "input_inventory"> & { input_inventory: Mutable<InputObservation>[] };
type Segment = { header: Mutable<SegmentHeader>; snapshot: SnapshotRecord; footer: { schema_version: string; record_count: number; digest: string } };
const fixtureRoot = join(import.meta.dir, "..", "fixtures", "trace", "openclaw", "30afbaf8-claim");
const headPath = ".boulder/trace-state/head.json";
const segmentPath = (root: string, head: TraceHead) => join(root, ".boulder/traces", head.fileName);
const fixture = (name: string) => join(fixtureRoot, name);

async function collect(root: string, name = "case-01-plain.sqlite", sessionId = "sess-plain-001"): Promise<TraceHead> {
  const result = await collectSession(root, { sessionId, dbPath: fixture(name), dryRun: false });
  expect(result.status).toBe("committed");
  return (await loadHead(root))!;
}
async function threeSegments(root: string): Promise<TraceHead[]> {
  return [await collect(root), await collect(root, "case-02-zstd.sqlite", "sess-zstd-001"),
    await collect(root, "case-04-missing-timing.sqlite", "sess-notiming-001")];
}
async function verify(root: string): Promise<{ exitCode: number; report: TraceVerifyReport }> {
  const result = await runBoulder(["trace", "verify", "--strict", "--json", "--cwd", root]);
  expect(result.stderr).toBe("");
  const report: TraceVerifyReport = JSON.parse(result.stdout);
  expect(report.schemaVersion).toBe("boulder.trace.verify.v1");
  return { exitCode: result.exitCode, report };
}
async function fails(root: string, ...checks: string[]): Promise<TraceVerifyReport> {
  const { exitCode, report } = await verify(root);
  expect(exitCode).toBe(1);
  expect(report.verdict).toBe("fail");
  expect(report.status).toBe("invalid");
  for (const check of checks) expect(report.failed_checks.map((failure) => failure.check)).toContain(check);
  return report;
}
async function changeHead(root: string, transform: (head: Mutable<TraceHead>) => void): Promise<void> {
  const head = (await loadHead(root))!;
  transform(head);
  await write(root, headPath, `${JSON.stringify(head)}\n`);
}
/** Rewrite valid JSON and optionally reseal cryptography, so semantic checks cannot pass merely because hashes fail. */
async function rewrite(root: string, head: TraceHead, mutate: (segment: Segment) => void,
  options: { snapshot?: boolean; publish?: boolean } = {}): Promise<void> {
  const lines = (await readFile(segmentPath(root, head), "utf8")).trimEnd().split("\n").map((line) => JSON.parse(line));
  const segment: Segment = { header: lines[0], snapshot: lines[1], footer: lines[2] };
  mutate(segment);
  if (options.snapshot) {
    segment.snapshot.snapshot_digest = await snapshotDigest(segment.snapshot);
    segment.header.snapshotRefs = segment.header.snapshotRefs.map((ref) => ref.snapshot_id === segment.snapshot.snapshot_id
      ? { ...ref, snapshot_digest: segment.snapshot.snapshot_digest } : ref);
  }
  const prefix = `${JSON.stringify(segment.header)}\n${JSON.stringify(segment.snapshot)}\n`;
  segment.footer.digest = await sha256Hex(prefix);
  const bytes = `${prefix}${JSON.stringify(segment.footer)}\n`;
  await writeFile(segmentPath(root, head), bytes, "utf8");
  if (options.publish !== false) await write(root, headPath, `${JSON.stringify({ ...head,
    digest: await sha256Hex(bytes), byteLength: new TextEncoder().encode(bytes).byteLength,
    snapshotRefs: segment.header.snapshotRefs })}\n`);
}

// Adversarial coverage: stale_state, misleading_success_output, malformed_input.
// Every failing scenario is exercised through the real CLI and asserts exit 1.
describe("trace verify --strict --json", () => {
  test("real collected multi-segment journal passes with separate coverage/fidelity and complete accounting", async () => {
    const root = await tempRepo();
    try {
      const heads = await threeSegments(root);
      const before = await readFile(join(root, headPath), "utf8");
      const { exitCode, report } = await verify(root);
      expect(exitCode).toBe(0);
      expect(report.verdict).toBe("pass");
      expect(report.status).toBe("verified");
      expect(report.failed_checks).toEqual([]);
      expect(report.head).toEqual(heads[2]);
      expect(report.journal_integrity.verdict).toBe("pass");
      expect(report.journal_integrity.segments_checked).toBe(3);
      expect(report.journal_integrity.records_checked).toBe(3);
      expect(report.source_coverage.verdict).toBe("pass");
      expect(report.source_coverage.snapshots_checked).toBe(3);
      expect(report.source_coverage.input_count).toBe(13);
      expect(report.source_coverage.disposition_counts).toEqual({ normalized: 13, ignored: 0, quarantined: 0 });
      expect(report.source_coverage.current_snapshots).toBe(3);
      expect(report.source_coverage.cold_history).toBe("not_collected");
      expect(report.telemetry_fidelity.verdict).toBe("pass");
      expect(report.telemetry_fidelity.normalized_observations).toBe(13);
      expect(report.telemetry_fidelity.timestamps_available).toBe(9);
      expect(report.telemetry_fidelity.timestamps_unavailable).toBe(4);
      expect(report.telemetry_fidelity.relationship_refs_checked).toBe(3);
      expect(report.telemetry_fidelity.usage_scope_unknown).toBeGreaterThan(0);
      expect(await readFile(join(root, headPath), "utf8")).toBe(before);
    } finally { await removeTempRepo(root); }
  });

  test("no head is an empty PASS with no coverage claim and no writes, even with unpublished bytes", async () => {
    const root = await tempRepo();
    try {
      const empty = await verify(root);
      expect(empty.exitCode).toBe(0);
      expect(empty.report.status).toBe("empty");
      expect(empty.report.verdict).toBe("pass");
      expect(empty.report.source_coverage.verdict).toBe("not_checked");
      expect(empty.report.telemetry_fidelity.verdict).toBe("not_checked");
      expect(await readdir(root)).toEqual([]);
      await write(root, ".boulder/traces/000001-unpublished.jsonl", "invalid unacknowledged bytes");
      const unpublished = await verify(root);
      expect(unpublished.exitCode).toBe(0);
      expect(unpublished.report.status).toBe("empty");
      expect(unpublished.report.journal_integrity.segments_checked).toBe(0);
      expect(await readdir(join(root, ".boulder"))).toEqual(["traces"]);
    } finally { await removeTempRepo(root); }
  });

  test("pins published head, ignores newer candidates/temps, and takes no writer lock", async () => {
    const root = await tempRepo();
    try {
      const first = await collect(root);
      const firstHead = await readFile(join(root, headPath), "utf8");
      const second = await collect(root, "case-02-zstd.sqlite", "sess-zstd-001");
      await write(root, headPath, firstHead);
      await writeFile(segmentPath(root, second), "corrupt unpublished successor\n", "utf8");
      await write(root, ".boulder/traces/unpublished.tmp", "partial");
      const lock = await acquire(root, { command: "verify test" });
      try {
        const owner = await readFile(join(lock.path, "owner.json"), "utf8");
        const result = await verify(root);
        expect(result.exitCode).toBe(0);
        expect(result.report.head).toEqual(first);
        expect(result.report.journal_integrity.segments_checked).toBe(1);
        expect(await readFile(join(root, headPath), "utf8")).toBe(firstHead);
        expect(await readFile(join(lock.path, "owner.json"), "utf8")).toBe(owner);
        expect(await readFile(segmentPath(root, second), "utf8")).toBe("corrupt unpublished successor\n");
      } finally { await lock.release(); }
    } finally { await removeTempRepo(root); }
  });

  test("single altered byte in valid JSON fails full-file and footer digests", async () => {
    const root = await tempRepo();
    try {
      const head = await collect(root);
      const bytes = await readFile(segmentPath(root, head), "utf8");
      const altered = bytes.replace('"role":"user"', '"role":"uXer"');
      expect(altered).not.toBe(bytes);
      expect(altered.length).toBe(bytes.length);
      await writeFile(segmentPath(root, head), altered, "utf8");
      await fails(root, "trace.segment_digest_mismatch", "trace.footer_digest_mismatch");
    } finally { await removeTempRepo(root); }
  });

  test("a footer-only altered byte is covered by the FULL-file digest and the record count check", async () => {
    const root = await tempRepo();
    try {
      const head = await collect(root);
      const bytes = await readFile(segmentPath(root, head), "utf8");
      await writeFile(segmentPath(root, head), bytes.replace('"record_count":1', '"record_count":2'), "utf8");
      const report = await fails(root, "trace.segment_digest_mismatch", "trace.record_count_mismatch");
      expect(report.failed_checks.map((failure) => failure.check)).not.toContain("trace.footer_digest_mismatch");
    } finally { await removeTempRepo(root); }
  });

  for (const which of ["head", "middle"] as const) test(`removed ${which} segment is not tolerated`, async () => {
    const root = await tempRepo();
    try {
      const heads = await threeSegments(root);
      await unlink(segmentPath(root, heads[which === "head" ? 2 : 1]));
      await fails(root, which === "head" ? "trace.head_segment_missing" : "trace.segment_missing");
    } finally { await removeTempRepo(root); }
  });

  test("head re-pointed to a different segment fails rather than choosing the newest file", async () => {
    const root = await tempRepo();
    try {
      const heads = await threeSegments(root);
      await changeHead(root, (head) => { head.fileName = heads[0].fileName; });
      await fails(root, "trace.head_invalid");
    } finally { await removeTempRepo(root); }
  });

  test("internally well-formed head re-pointing still checks referenced bytes and metadata", async () => {
    const root = await tempRepo();
    try {
      const heads = await threeSegments(root);
      await changeHead(root, (head) => {
        head.fileName = heads[0].fileName; head.sequence = heads[0].sequence; head.batchId = heads[0].batchId;
      });
      await fails(root, "trace.segment_digest_mismatch", "trace.head_metadata_mismatch");
    } finally { await removeTempRepo(root); }
  });

  test("middle predecessor edited with a valid footer breaks chain continuity in both directions", async () => {
    const root = await tempRepo();
    try {
      const heads = await threeSegments(root);
      await rewrite(root, heads[1], ({ header }) => { header.previous_segment_hash = "f".repeat(64); }, { publish: false });
      const report = await fails(root, "trace.chain_mismatch");
      expect(report.failed_checks.filter((failure) => failure.check === "trace.chain_mismatch").map((failure) => failure.fileName))
        .toEqual([heads[1].fileName, heads[2].fileName]);
    } finally { await removeTempRepo(root); }
  });

  const structuralCases: { name: string; check: string; mutate: (segment: Segment) => void }[] = [
    { name: "genesis hash", check: "trace.genesis_hash_mismatch", mutate: ({ header }) => { header.previous_segment_hash = "f".repeat(64); } },
    { name: "header sequence", check: "trace.segment_header_mismatch", mutate: ({ header }) => { header.sequence = 2; } },
    { name: "header batch identity", check: "trace.segment_header_mismatch", mutate: ({ header }) => { header.batch_id = "other-batch"; } },
    { name: "footer count with resealed head", check: "trace.record_count_mismatch", mutate: ({ footer }) => { footer.record_count = 2; } }
  ];
  for (const item of structuralCases) test(`${item.name} fails even with a recomputed full-file digest`, async () => {
    const root = await tempRepo();
    try {
      const head = await collect(root);
      await rewrite(root, head, item.mutate);
      await fails(root, item.check);
    } finally { await removeTempRepo(root); }
  });

  for (const field of ["byteLength", "committedAt", "snapshotRefs"] as const) test(`head ${field} is checked independently`, async () => {
    const root = await tempRepo();
    try {
      await collect(root);
      await changeHead(root, (head) => {
        if (field === "byteLength") head.byteLength += 1;
        else if (field === "committedAt") head.committedAt = "2000-01-01T00:00:00.000Z";
        else head.snapshotRefs = [];
      });
      await fails(root, field === "byteLength" ? "trace.head_length_mismatch" : "trace.head_metadata_mismatch");
    } finally { await removeTempRepo(root); }
  });

  for (const malformed of ["{broken", "null", "[]", '{"schema_version":"wrong"}']) test(`malformed head ${malformed} yields a named JSON failure, not a crash`, async () => {
    const root = await tempRepo();
    try {
      await write(root, headPath, malformed);
      await fails(root, "trace.head_invalid");
    } finally { await removeTempRepo(root); }
  });

  for (const [name, bytes, check] of [
    ["JSON", "{broken\n", "trace.segment_json_invalid"],
    ["framing", "missing-newline", "trace.segment_framing_invalid"],
    ["header", "null\n{}\n{}\n", "trace.segment_header_invalid"],
    ["record", null, "trace.segment_record_invalid"]
  ] as const) test(`malformed segment ${name} yields a named JSON failure, not a crash`, async () => {
    const root = await tempRepo();
    try {
      const head = await collect(root);
      const original = await readFile(segmentPath(root, head), "utf8");
      const lines = original.split("\n");
      lines[1] = "null";
      await writeFile(segmentPath(root, head), bytes ?? lines.join("\n"), "utf8");
      await fails(root, check);
    } finally { await removeTempRepo(root); }
  });

  const semanticCases: { name: string; check: string; mutate: (segment: Segment) => void }[] = [
    { name: "input count", check: "trace.inventory_reconciliation", mutate: ({ snapshot }) => { snapshot.coverage = { kind: "full_session", input_count: 6 }; } },
    { name: "dispositions", check: "trace.inventory_reconciliation", mutate: ({ snapshot }) => { snapshot.disposition_counts = { normalized: 4, ignored: 1, quarantined: 0 }; } },
    { name: "source row conflict", check: "trace.source_row_conflict", mutate: ({ snapshot }) => { snapshot.input_inventory[1].source_row_key = snapshot.input_inventory[0].source_row_key; } },
    { name: "event identity conflict", check: "trace.event_identity_conflict", mutate: ({ snapshot }) => {
      snapshot.input_inventory[0].logical_event_id = "native-id"; snapshot.input_inventory[1].logical_event_id = "native-id";
    } },
    { name: "bad revision", check: "trace.source_revision_invalid", mutate: ({ snapshot }) => { snapshot.input_inventory[0].source_revision = "not-a-digest"; } },
    { name: "unresolved relationship", check: "trace.relationship_ref_unresolved", mutate: ({ snapshot }) => {
      snapshot.input_inventory[3].normalized_facts!.request_event_ref = { source_row_key: "absent", source_revision: "f".repeat(64) };
    } },
    { name: "stale selected revision", check: "trace.relationship_ref_unresolved", mutate: ({ snapshot }) => {
      (snapshot.input_inventory[3].normalized_facts!.request_event_ref as Record<string, unknown>).source_revision = "f".repeat(64);
    } },
    { name: "relationship to wrong request", check: "trace.relationship_ref_invalid", mutate: ({ snapshot }) => {
      snapshot.input_inventory[3].normalized_facts!.request_event_id = "different-request";
    } },
    { name: "missing result ref", check: "trace.relationship_ref_unresolved", mutate: ({ snapshot }) => {
      delete snapshot.input_inventory[3].normalized_facts!.request_event_ref;
    } },
    { name: "wrong supersession", check: "trace.snapshot_supersession_mismatch", mutate: ({ snapshot }) => { snapshot.supersedes_snapshot_id = "absent-snapshot"; } },
    { name: "checkpoint refs", check: "trace.snapshot_refs_mismatch", mutate: ({ header }) => { header.snapshotRefs = []; } }
  ];
  for (const item of semanticCases) test(`${item.name} fails despite valid journal and snapshot hashes`, async () => {
    const root = await tempRepo();
    try {
      const head = await collect(root);
      await rewrite(root, head, item.mutate, { snapshot: true });
      const report = await fails(root, item.check);
      expect(report.journal_integrity.verdict).toBe("pass");
    } finally { await removeTempRepo(root); }
  });

  test("snapshot content digest is independent of journal hashes", async () => {
    const root = await tempRepo();
    try {
      const head = await collect(root);
      await rewrite(root, head, ({ snapshot }) => { snapshot.input_inventory[0].source_revision = "f".repeat(64); });
      const report = await fails(root, "trace.snapshot_digest_mismatch");
      expect(report.journal_integrity.verdict).toBe("pass");
    } finally { await removeTempRepo(root); }
  });

  test("quarantine accounting is reported separately from valid journal integrity", async () => {
    const root = await tempRepo();
    try {
      await collect(root, "case-06-malformed.sqlite", "sess-malformed-001");
      const report = await fails(root, "trace.snapshot_quarantined");
      expect(report.journal_integrity.verdict).toBe("pass");
      expect(report.source_coverage.verdict).toBe("fail");
      expect(report.source_coverage.disposition_counts).toEqual({ normalized: 1, ignored: 0, quarantined: 4 });
      expect(report.source_coverage.input_count).toBe(5);
    } finally { await removeTempRepo(root); }
  });

  test("segment symlinks fail without following an external path", async () => {
    const root = await tempRepo();
    try {
      const head = await collect(root);
      await unlink(segmentPath(root, head));
      await symlink(fixture("case-01-plain.sqlite"), segmentPath(root, head));
      await fails(root, "trace.journal_path_unsafe");
    } finally { await removeTempRepo(root); }
  });

  test("--strict without --json prints named human-readable failures and exits nonzero", async () => {
    const root = await tempRepo();
    try {
      const head = await collect(root);
      await unlink(segmentPath(root, head));
      const result = await runBoulder(["trace", "verify", "--strict", "--cwd", root]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("FAIL trace.head_segment_missing:");
      expect(result.stdout).toContain("journal_integrity: fail");
      expect(result.stdout).toContain("source_coverage:");
      expect(result.stdout).toContain("telemetry_fidelity:");
    } finally { await removeTempRepo(root); }
  });
});
