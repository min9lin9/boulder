import * as fs from "node:fs/promises";
import { join } from "node:path";
import * as bunTest from "bun:test";
import { acquire, WriterBusyError } from "../src/evidence-write-lock";
import * as writes from "../src/fs";
import { captureRoutine, type RoutineArtifact } from "../src/routine";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

const { describe, expect, test } = bunTest;
// The repository's minimal bun:test declarations do not include spyOn.
const { spyOn } = bunTest as unknown as {
  spyOn<T, K extends keyof T>(target: T, method: K): {
    mockImplementation(implementation: T[K]): void;
    mockRestore(): void;
  };
};

const task = "shared capture";
const relativePath = ".boulder/routines/shared-capture.json";
const original: RoutineArtifact = {
  schemaVersion: 1,
  id: "shared-capture",
  title: task,
  task,
  normalizedTask: task,
  profileId: "programming-default",
  createdAt: "2020-01-01T00:00:00.000Z",
  seenCount: 7,
  lastSeenAt: "2020-01-01T00:00:00.000Z",
  evidenceRefs: [
    { kind: "trace", path: ".boulder/traces/first.json", hash: "first" },
    { kind: "trace", path: ".boulder/traces/second.json", note: "second" },
    { kind: "file", path: "../unsafe.json" }
  ]
};

const capture = (root: string, write = true) => captureRoutine(root, task, "programming-default", write);

async function expectBusy(operation: Promise<unknown>): Promise<void> {
  const result = await bounded(operation).then(() => null, (error: unknown) => error);
  expect(result instanceof WriterBusyError).toBe(true);
  expect(result instanceof WriterBusyError ? result.code : null).toBe("trace.writer_busy");
}

function signal(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Capture barrier was not reached")), 2000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe("routine shared evidence writer lock", () => {
  test("CLI reports writer contention without a stack trace or changing the held lock", async () => {
    const root = await tempRepo();
    try {
      const writer = await acquire(root, { command: "held during CLI capture" });
      try {
        const result = await bounded(runBoulder(["routine", "capture", "--task", "x", "--write", "--cwd", root]));
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toBe("");
        expect(result.stderr.trim()).toMatch(/^ERROR trace\.writer_busy: [^\r\n]+$/);
        expect(await fs.readdir(join(root, ".boulder"))).toEqual(["trace-state"]);
        expect(JSON.parse(await fs.readFile(join(writer.path, "owner.json"), "utf8"))).toEqual(writer.owner);
      } finally {
        await writer.release();
      }
    } finally {
      await removeTempRepo(root);
    }
  });

  test("holds the lock from the existing read through replacement; a racing capture is retryable", async () => {
    const root = await tempRepo();
    const path = join(root, relativePath);
    const readReached = signal();
    const resumeRead = signal();
    const writeReached = signal();
    const resumeWrite = signal();
    const readFile = fs.readFile;
    const safeReplaceText = writes.safeReplaceText;
    const readSpy = spyOn(fs, "readFile");
    const writeSpy = spyOn(writes, "safeReplaceText");
    let reads = 0;
    readSpy.mockImplementation(async (target, encoding) => {
      const content = await readFile(target, encoding);
      if (target === path) {
        reads += 1;
        readReached.resolve();
        await resumeRead.promise;
      }
      return content;
    });
    writeSpy.mockImplementation(async (target, content) => {
      if (target === path) {
        writeReached.resolve();
        await resumeWrite.promise;
      }
      await safeReplaceText(target, content);
    });
    try {
      await write(root, relativePath, JSON.stringify(original));
      const first = capture(root);
      const prematureCompletion = first.then(() => { throw new Error("Capture bypassed the barriers"); });
      try {
        await bounded(Promise.race([readReached.promise, prematureCompletion]));
        // This call starts while the first capture has read but not yet merged/written.
        await expectBusy(capture(root));
        expect(reads).toBe(1);
        expect(JSON.parse(await readFile(path, "utf8"))).toEqual(original);
        resumeRead.resolve();
        await bounded(Promise.race([writeReached.promise, prematureCompletion]));
        await expectBusy(acquire(root, { command: "competing evidence writer" }));
      } finally {
        resumeRead.resolve();
        resumeWrite.resolve();
        await first;
      }
      const second = await capture(root);
      const stored = JSON.parse(await readFile(path, "utf8"));
      expect(second.status).toBe("written");
      expect(stored).toEqual(second.routine);
      expect(stored.schemaVersion).toBe(1);
      expect(stored.seenCount).toBe(9);
      expect(stored.createdAt).toBe(original.createdAt);
      expect(stored.lastSeenAt >= stored.createdAt).toBe(true);
      expect(stored.evidenceRefs).toEqual(original.evidenceRefs.slice(0, 2));
      const released = await acquire(root, { command: "after captures" });
      await released.release();
    } finally {
      readSpy.mockRestore();
      writeSpy.mockRestore();
      await removeTempRepo(root);
    }
  });

  test("does not load before acquiring and retains refs committed by another writer on retry", async () => {
    const root = await tempRepo();
    try {
      const writer = await acquire(root, { command: "evidence append" });
      const appended = { kind: "trace", path: ".boulder/traces/appended.json" };
      try {
        // A read before acquire would fail parsing rather than return writer_busy.
        await write(root, relativePath, "{incomplete");
        await expectBusy(capture(root));
        await writes.safeReplaceText(join(root, relativePath), JSON.stringify({
          ...original,
          evidenceRefs: [...original.evidenceRefs, appended]
        }));
      } finally {
        await writer.release();
      }
      const result = await capture(root);
      expect(result.routine.seenCount).toBe(8);
      expect(result.routine.createdAt).toBe(original.createdAt);
      expect(result.routine.evidenceRefs).toEqual([...original.evidenceRefs.slice(0, 2), appended]);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("dry-run creates no lock state and succeeds while another writer holds the lock", async () => {
    const root = await tempRepo();
    try {
      const plan = await capture(root, false);
      expect(await fs.readdir(root)).toEqual([]);
      const writer = await acquire(root, { command: "held during dry-run" });
      try {
        await write(root, relativePath, "{incomplete");
        const heldPlan = await capture(root, false);
        expect(heldPlan).toEqual(plan);
        expect(heldPlan.status).toBe("dry-run");
        expect(heldPlan.routine.seenCount).toBe(1);
        expect(heldPlan.routine.createdAt).toBe("1970-01-01T00:00:00.000Z");
        expect(heldPlan.routine.lastSeenAt).toBe("1970-01-01T00:00:00.000Z");
        expect(heldPlan.routine.evidenceRefs).toEqual([]);
        expect(writer.held).toBe(true);
        await expectBusy(acquire(root, { command: "dry-run lock probe" }));
        expect(await fs.readFile(join(root, relativePath), "utf8")).toBe("{incomplete");
      } finally {
        await writer.release();
      }
    } finally {
      await removeTempRepo(root);
    }
  });

  test("releases the lock after a replacement error without reporting success or changing the artifact", async () => {
    const root = await tempRepo();
    const path = join(root, relativePath);
    const safeReplaceText = writes.safeReplaceText;
    const failure = new Error("replacement failed");
    const writeSpy = spyOn(writes, "safeReplaceText");
    writeSpy.mockImplementation(async (target, content) => {
      if (target === path) throw failure;
      await safeReplaceText(target, content);
    });
    try {
      await write(root, relativePath, JSON.stringify(original));
      const result = await capture(root).then(() => null, (error: unknown) => error);
      expect(result).toBe(failure);
      expect(JSON.parse(await fs.readFile(path, "utf8"))).toEqual(original);
      const writer = await acquire(root, { command: "after replacement error" });
      await writer.release();
    } finally {
      writeSpy.mockRestore();
      await removeTempRepo(root);
    }
  });

  test("releases the lock after a read error so a repaired artifact can be captured", async () => {
    const root = await tempRepo();
    try {
      await write(root, relativePath, "{incomplete");
      const error = await capture(root).then(() => null, (error: unknown) => error);
      expect(error instanceof SyntaxError).toBe(true);
      const writer = await acquire(root, { command: "repair" });
      try {
        await write(root, relativePath, JSON.stringify(original));
      } finally {
        await writer.release();
      }
      expect((await capture(root)).routine.seenCount).toBe(8);
    } finally {
      await removeTempRepo(root);
    }
  });
});
