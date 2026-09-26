import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  isSourceConfig,
  loadSourceConfig,
  registerSource,
  requireSourceConfig,
  sourceConfigPath,
  SourceConfigNotFoundError,
  SOURCE_CONFIG_SCHEMA_VERSION
} from "../src/trace/source-config";
import { removeTempRepo, tempRepo, write } from "./helpers/cli";

describe("trace source-config", () => {
  test("register + load round-trip in a temp repo", async () => {
    const root = await tempRepo();
    try {
      const registered = await registerSource(root, { db_path: "/data/openclaw-agent.sqlite" });
      expect(registered.schemaVersion).toBe(SOURCE_CONFIG_SCHEMA_VERSION);
      expect(registered.adapter_id).toBe("openclaw-local");
      expect(registered.source_instance_id).toMatch(/^[0-9a-f-]{36}$/);

      const onDisk = JSON.parse(await readFile(sourceConfigPath(root), "utf8"));
      expect(isSourceConfig(onDisk)).toBe(true);

      const loaded = await loadSourceConfig(root);
      expect(loaded).toEqual(registered);
      expect(loaded?.db_path).toBe("/data/openclaw-agent.sqlite");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("operator-provided source_instance_id is preserved", async () => {
    const root = await tempRepo();
    try {
      const registered = await registerSource(root, { db_path: "/tmp/a.sqlite" }, { source_instance_id: "operator-id-1" });
      expect(registered.source_instance_id).toBe("operator-id-1");
      expect((await loadSourceConfig(root))?.source_instance_id).toBe("operator-id-1");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("re-registering after moving the db keeps identity when operator re-registers with same id", async () => {
    const root = await tempRepo();
    try {
      const first = await registerSource(root, { db_path: "/old/place.sqlite" });
      const second = await registerSource(root, { db_path: "/new/place.sqlite" }, { source_instance_id: first.source_instance_id });
      expect(second.source_instance_id).toBe(first.source_instance_id);
      expect((await loadSourceConfig(root))?.db_path).toBe("/new/place.sqlite");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("missing file -> loadSourceConfig returns null, requireSourceConfig throws a clear error", async () => {
    const root = await tempRepo();
    try {
      expect(await loadSourceConfig(root)).toBeNull();
      let caught: unknown = null;
      try {
        await requireSourceConfig(root);
      } catch (error) {
        caught = error;
      }
      expect(caught instanceof SourceConfigNotFoundError).toBe(true);
      expect((caught as Error).message).toContain("No trace source registered");
    } finally {
      await removeTempRepo(root);
    }
  });

  test("dryRun writes nothing", async () => {
    const root = await tempRepo();
    try {
      const config = await registerSource(root, { db_path: "/dry.sqlite" }, { dryRun: true });
      expect(isSourceConfig(config)).toBe(true);
      expect(await loadSourceConfig(root)).toBeNull();
    } finally {
      await removeTempRepo(root);
    }
  });

  test("malformed JSON is rejected by the guard", async () => {
    const root = await tempRepo();
    try {
      await write(root, ".boulder/trace-state/source-config.json", "{not json");
      expect(await loadSourceConfig(root)).toBeNull();

      await write(root, ".boulder/trace-state/source-config.json", JSON.stringify({ schemaVersion: "wrong", db_path: 42 }));
      expect(await loadSourceConfig(root)).toBeNull();

      expect(isSourceConfig(null)).toBe(false);
      expect(isSourceConfig({ schemaVersion: SOURCE_CONFIG_SCHEMA_VERSION })).toBe(false);
    } finally {
      await removeTempRepo(root);
    }
  });

  test("registerSource rejects an empty db_path", async () => {
    const root = await tempRepo();
    try {
      let caught: unknown = null;
      try {
        await registerSource(root, { db_path: "" });
      } catch (error) {
        caught = error;
      }
      expect(caught instanceof Error).toBe(true);
    } finally {
      await removeTempRepo(root);
    }
  });
});
