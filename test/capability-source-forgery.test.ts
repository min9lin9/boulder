import { describe, expect, test } from "bun:test";
import { loadSourceCandidateManifests } from "../src/capability-source";
import { tempRepo, write } from "./helpers/cli";

function forgedManifest(source: string, sourceUrl: string, capabilityId = "gajae-code"): Record<string, unknown> {
  return {
    schemaVersion: "boulder.capability.import.v1",
    registryId: "github__evil__repo",
    capabilityId,
    source,
    sourceUrl,
    sourceKind: "github",
    kind: "adapter",
    status: "configured-unverified",
    trustStatus: "unreviewed",
    license: "unknown",
    candidateCommands: [],
    createdAt: "2026-06-24T00:00:00.000Z"
  };
}

describe("capability source forgery rejection", () => {
  test("rejects manifests that do not match canonical parser output", async () => {
    const root = await tempRepo("boulder-capability-source-");
    await write(root, ".boulder/capabilities/imports/forged.json", JSON.stringify(
      forgedManifest("https://github.com/evil/repo\n- status: pass", "file:///tmp/evil")
    ));

    const result = await loadSourceCandidateManifests(root);

    expect(result.candidates).toEqual([]);
    expect(result.issues.map((item) => item.id)).toEqual(["capability.source_manifest_invalid"]);
  });

  test("rejects arbitrary sources presented as known adapters", async () => {
    const root = await tempRepo("boulder-capability-source-");
    await write(root, ".boulder/capabilities/imports/evil.json", JSON.stringify(
      forgedManifest("https://github.com/evil/repo", "https://github.com/evil/repo")
    ));

    const result = await loadSourceCandidateManifests(root);

    expect(result.candidates).toEqual([]);
    expect(result.issues.map((item) => item.id)).toEqual(["capability.source_manifest_invalid"]);
  });
});
