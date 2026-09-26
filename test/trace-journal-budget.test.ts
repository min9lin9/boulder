import { describe, expect, test } from "bun:test";
import { link, readFile, readdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import {
  commitBatch, DEFAULT_JOURNAL_MAX_SEGMENTS, loadHead, TraceCommitError, type JournalBatch
} from "../src/trace/journal";
import { removeTempRepo, runBoulder, runCommand, tempRepo, write } from "./helpers/cli";

const command = "test journal budget";
const state = ".boulder/trace-state";
const configPath = `${state}/journal-config.json`;
const headPath = `${state}/head.json`;
const traces = ".boulder/traces";

function batch(sequence = 1, previous: string | null = null): JournalBatch {
  return {
    schema_version: "boulder.trace.batch.v1", journal_id: "journal-budget",
    batch_id: `batch-${sequence}`, batch_seq: sequence, previous_segment_hash: previous,
    adapter_id: "test", interpretation_version: "test.v1", content_policy_version: "test.v1",
    records: [{ observation: sequence }], snapshotRefs: []
  };
}

async function refusal(operation: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try { await operation; } catch (error) { caught = error; }
  expect(caught instanceof TraceCommitError).toBe(true);
  expect((caught as TraceCommitError).code).toBe(code);
}

async function configure(root: string, maxSegments: number): Promise<void> {
  await write(root, configPath, JSON.stringify({ max_segments: maxSegments }));
}

describe("trace journal budget", () => {
  test("missing config uses the default without creating a config file", async () => {
    const root = await tempRepo();
    try {
      expect(DEFAULT_JOURNAL_MAX_SEGMENTS).toBe(1000);
      expect((await commitBatch(root, batch(), { command })).status).toBe("committed");
      expect(await readdir(join(root, state))).toEqual(["head.json"]);
    } finally { await removeTempRepo(root); }
  });

  test("zero budget visibly refuses before any segment or head is written", async () => {
    const root = await tempRepo();
    try {
      await configure(root, 0);
      await refusal(commitBatch(root, batch(), { command }), "trace.journal_budget_exceeded");
      expect(await loadHead(root)).toBeNull();
      expect(await readdir(join(root, ".boulder"))).toEqual(["trace-state"]);
      expect(await readdir(join(root, state))).toEqual(["journal-config.json"]);
    } finally { await removeTempRepo(root); }
  });

  test("exact cap permits duplicates but refuses growth without pruning; raising it permits progress", async () => {
    const root = await tempRepo();
    try {
      await configure(root, 1);
      const first = await commitBatch(root, batch(), { command });
      const head = await readFile(join(root, headPath), "utf8");
      const segment = await readFile(join(root, traces, first.fileName), "utf8");
      expect((await commitBatch(root, batch(), { command })).status).toBe("duplicate");
      await refusal(commitBatch(root, batch(2, first.digest), { command }), "trace.journal_budget_exceeded");
      expect(await readFile(join(root, headPath), "utf8")).toBe(head);
      expect(await readFile(join(root, traces, first.fileName), "utf8")).toBe(segment);
      expect(await readdir(join(root, traces))).toEqual([first.fileName]);
      expect((await readdir(join(root, state))).sort()).toEqual(["head.json", "journal-config.json"]);
      await configure(root, 2);
      expect((await commitBatch(root, batch(2, first.digest), { command })).status).toBe("committed");
      await configure(root, 0);
      expect((await commitBatch(root, batch(2, first.digest), { command })).status).toBe("duplicate");
    } finally { await removeTempRepo(root); }
  });

  test("refusal counts unpublished segments and advances neither recovery nor temp cleanup", async () => {
    const root = await tempRepo();
    try {
      await configure(root, 2);
      const first = await commitBatch(root, batch(), { command });
      const head = await readFile(join(root, headPath), "utf8");
      const second = await commitBatch(root, batch(2, first.digest), { command });
      await write(root, headPath, head); // Simulate a complete segment left before head publication.
      await write(root, `${traces}/orphan.tmp`, "retain on budget refusal");
      await write(root, `${headPath}.tmp`, "retain on budget refusal");
      await refusal(commitBatch(root, batch(3, second.digest), { command }), "trace.journal_budget_exceeded");
      // Retrying an older batch cannot bypass the cap either.
      await refusal(commitBatch(root, batch(), { command }), "trace.journal_budget_exceeded");
      expect(await readFile(join(root, headPath), "utf8")).toBe(head);
      expect((await readdir(join(root, traces))).sort()).toEqual([first.fileName, second.fileName, "orphan.tmp"]);
      expect((await readdir(join(root, state))).sort()).toEqual(["head.json", "head.json.tmp", "journal-config.json"]);
      // Same-ID crash retry still crosses real recovery, which now publishes and cleans temps.
      expect((await commitBatch(root, batch(2, first.digest), { command })).status).toBe("duplicate");
      expect((await loadHead(root))!.sequence).toBe(2);
      expect((await readdir(join(root, traces))).sort()).toEqual([first.fileName, second.fileName]);
    } finally { await removeTempRepo(root); }
  });

  for (const config of ["{", "null", "{}", '{"max_segments":-1}', '{"max_segments":1.5}',
    '{"max_segments":"1"}', '{"max_segments":9007199254740992}', '{"max_segments":1,"max_segment":2}']) {
    test(`invalid budget fails closed: ${config}`, async () => {
      const root = await tempRepo();
      try {
        await write(root, configPath, config);
        await refusal(commitBatch(root, batch(), { command }), "trace.journal_budget_config_invalid");
        expect(await loadHead(root)).toBeNull();
        expect(await readdir(join(root, state))).toEqual(["journal-config.json"]);
        expect(await readFile(join(root, configPath), "utf8")).toBe(config);
      } finally { await removeTempRepo(root); }
    });
  }

  for (const kind of ["symlink", "hardlink"]) {
    test(`budget config rejects a ${kind} without changing its target`, async () => {
      const root = await tempRepo();
      try {
        await write(root, "target.json", '{"max_segments":1}');
        await write(root, `${state}/keep`, "");
        await (kind === "symlink" ? symlink : link)(join(root, "target.json"), join(root, configPath));
        await refusal(commitBatch(root, batch(), { command }), "trace.journal_path_unsafe");
        expect(await loadHead(root)).toBeNull();
        expect(await readFile(join(root, "target.json"), "utf8")).toBe('{"max_segments":1}');
      } finally { await removeTempRepo(root); }
    });
  }

  test("collect CLI emits the named refusal, nonzero exit, and no success report or journal progress", async () => {
    const root = await tempRepo();
    try {
      await configure(root, 0);
      const db = join(import.meta.dir, "..", "fixtures/trace/openclaw/30afbaf8-claim/case-01-plain.sqlite");
      const result = await runBoulder(["trace", "collect", "--source", "openclaw-local", "--session", "sess-plain-001",
        "--db-path", db, "--once", "--write", "--json", "--cwd", root]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("ERROR trace.journal_budget_exceeded:");
      expect(await loadHead(root)).toBeNull();
      expect(await readdir(join(root, ".boulder"))).toEqual(["trace-state"]);
      // Source registration may precede commit, but neither checkpoint nor lock remains.
      expect((await readdir(join(root, state))).sort()).toEqual(["journal-config.json", "source-config.json"]);
    } finally { await removeTempRepo(root); }
  });
});

describe("trace git hygiene", () => {
  const ignored: Record<string, string> = {
    ".boulder/traces/x.jsonl": ".boulder/traces/",
    ".boulder/trace-state/head.json": ".boulder/trace-state/",
    ".boulder/trace-state/journal-config.json": ".boulder/trace-state/",
    ".boulder/trace-cache/x.json": ".boulder/trace-cache/",
    ".boulder/writer.lock": ".boulder/**/writer.lock",
    ".boulder/evidence/nested/writer.lock/owner.json": ".boulder/**/writer.lock",
    ".boulder/routines/writer.lock": ".boulder/**/writer.lock",
    ".boulder/runs/a/writer.lock": ".boulder/**/writer.lock"
  };
  const committable = [".boulder/evidence/", ".boulder/evidence/traces/b.json",
    ".boulder/routines/", ".boulder/routines/x.json", ".boulder/runs/", ".boulder/runs/x.json"];
  for (const path of [...Object.keys(ignored), ...committable]) {
    test(`git check-ignore: ${path}`, async () => {
      const result = await runCommand(`git check-ignore --no-index --non-matching -v ${path}`, join(import.meta.dir, ".."));
      expect(result.stderr).toBe("");
      const [match, checkedPath] = result.stdout.trim().split("\t");
      expect(checkedPath).toBe(path);
      expect(result.exitCode).toBe(path in ignored ? 0 : 1);
      expect(match.split(":")[2]).toBe(ignored[path] ?? "");
      if (path in ignored) expect(match.split(":")[0]).toBe(".gitignore");
    });
  }
});
