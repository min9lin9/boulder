import { link, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  buildSourceCandidateManifest,
  loadSourceCandidateManifests,
  parseCapabilitySource,
  writeSourceCandidateManifest
} from "../src/capability-source";

const FIXED_DATE = new Date("2026-06-24T00:00:00.000Z");

async function tempRepo(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "boulder-capability-source-"));
}

async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

describe("capability source manifests", () => {
  test("canonicalizes known GitHub adapter source URLs", () => {
    const source = parseCapabilitySource("github.com/Yeachan-Heo/gajae-code");
    const manifest = buildSourceCandidateManifest(source, {}, FIXED_DATE);

    expect(manifest).toEqual({
      schemaVersion: "boulder.capability.import.v1",
      registryId: "github__yeachan-heo__gajae-code",
      capabilityId: "gajae-code",
      source: "https://github.com/Yeachan-Heo/gajae-code",
      sourceUrl: "https://github.com/Yeachan-Heo/gajae-code",
      sourceKind: "github",
      kind: "adapter",
      status: "configured-unverified",
      trustStatus: "unreviewed",
      license: "unknown",
      candidateCommands: [],
      createdAt: "2026-06-24T00:00:00.000Z"
    });
  });

  test("recognizes known GitHub adapters regardless of owner casing", () => {
    const manifest = buildSourceCandidateManifest(
      parseCapabilitySource("HTTPS://GitHub.com/yeachan-heo/gajae-code"),
      {},
      FIXED_DATE
    );

    expect(manifest.registryId).toBe("github__yeachan-heo__gajae-code");
    expect(manifest.capabilityId).toBe("gajae-code");
    expect(manifest.kind).toBe("adapter");
    expect(manifest.source).toBe("https://github.com/yeachan-heo/gajae-code");
  });

  test("recognizes agency-agents as a subagent catalog source", () => {
    const manifest = buildSourceCandidateManifest(
      parseCapabilitySource("https://github.com/msitarzewski/agency-agents"),
      {},
      FIXED_DATE
    );

    expect(manifest.registryId).toBe("github__msitarzewski__agency-agents");
    expect(manifest.capabilityId).toBe("agency-agents");
    expect(manifest.kind).toBe("agent-catalog");
  });

  test("defaults unknown GitHub and ClawHub sources to skill manifests", () => {
    const github = buildSourceCandidateManifest(
      parseCapabilitySource("https://github.com/mattpocock/skills"),
      {},
      FIXED_DATE
    );
    const clawhub = buildSourceCandidateManifest(parseCapabilitySource("clawhub:kimi-skills"), {}, FIXED_DATE);

    expect(github.registryId).toBe("github__mattpocock__skills");
    expect(github.capabilityId).toBe("skills");
    expect(github.kind).toBe("skill");
    expect(github.sourceUrl).toBe("https://github.com/mattpocock/skills");
    expect(clawhub.registryId).toBe("clawhub__kimi-skills");
    expect(clawhub.capabilityId).toBe("kimi-skills");
    expect(clawhub.kind).toBe("skill");
    expect(clawhub.source).toBe("clawhub:kimi-skills");
    expect(clawhub.sourceUrl).toBe(null);
  });

  test("requires an explicit capability id for unknown adapter source URLs", () => {
    const source = parseCapabilitySource("https://github.com/example/custom-agent");
    const manifest = buildSourceCandidateManifest(source, { kind: "adapter", capabilityId: "custom-agent" }, FIXED_DATE);

    expect(manifest.registryId).toBe("github__example__custom-agent");
    expect(manifest.capabilityId).toBe("custom-agent");
    expect(manifest.kind).toBe("adapter");
  });

  test("loads explicit adapter manifests only when capability id matches the source repo", async () => {
    const root = await tempRepo();
    const manifest = buildSourceCandidateManifest(
      parseCapabilitySource("https://github.com/example/custom-agent"),
      { kind: "adapter", capabilityId: "custom-agent" },
      FIXED_DATE
    );
    await writeSourceCandidateManifest(root, manifest);

    const result = await loadSourceCandidateManifests(root);

    expect(result.candidates.map((item) => item.capabilityId)).toEqual(["custom-agent"]);
    expect(result.issues).toEqual([]);
  });

  test("rejects unsafe and ambiguous source forms", () => {
    const rejected = [
      "Yeachan-Heo/gajae-code",
      "git@github.com:Yeachan-Heo/gajae-code.git",
      "https://github.com/Yeachan-Heo/gajae-code/tree/main",
      "https://github.com/Yeachan-Heo/gajae-code.git",
      "https://github.com/Yeachan-Heo/gajae-code?x=1",
      "https://user:pass@github.com/Yeachan-Heo/gajae-code",
      "http://github.com/Yeachan-Heo/gajae-code",
      "https://www.github.com/Yeachan-Heo/gajae-code",
      "https://github.com/Yeachan-Heo/gajae-code/",
      "clawhub:owner/repo",
      "clawhub:.",
      "",
      "https://github.com/Yeachan-Heo/gajae-code\n"
    ];

    for (const value of rejected) {
      expectSourceInvalid(value);
    }
  });

  test("writes manifests idempotently and rejects conflicting duplicates", async () => {
    const root = await tempRepo();
    const source = parseCapabilitySource("https://github.com/code-yeongyu/lazycodex");
    const manifest = buildSourceCandidateManifest(source, {}, FIXED_DATE);

    const first = await writeSourceCandidateManifest(root, manifest);
    const second = await writeSourceCandidateManifest(root, manifest);
    const conflicting = { ...manifest, capabilityId: "other-lazycodex" };

    expect(first.status).toBe("created");
    expect(second.status).toBe("unchanged");
    expect(await readFile(first.path, "utf8")).toContain('"capabilityId": "lazycodex"');
    await expect(writeSourceCandidateManifest(root, conflicting)).rejects.toThrow("capability.manifest_exists");
  });

  test("rejects unsafe manifest paths", async () => {
    const root = await tempRepo();
    const outside = await tempRepo();
    await mkdir(join(root, ".boulder", "capabilities"), { recursive: true });
    await symlink(outside, join(root, ".boulder", "capabilities", "imports"));

    const manifest = buildSourceCandidateManifest(parseCapabilitySource("clawhub:kimi-skills"), {}, FIXED_DATE);

    await expect(writeSourceCandidateManifest(root, manifest)).rejects.toThrow("capability.manifest_path_unsafe");
  });

  test("rejects existing manifest hardlinks before writing", async () => {
    const root = await tempRepo();
    const outside = await tempRepo();
    const manifest = buildSourceCandidateManifest(parseCapabilitySource("clawhub:kimi-skills"), {}, FIXED_DATE);
    await write(outside, "shared.json", JSON.stringify(manifest));
    await mkdir(join(root, ".boulder", "capabilities", "imports"), { recursive: true });
    await link(join(outside, "shared.json"), join(root, ".boulder", "capabilities", "imports", "clawhub__kimi-skills.json"));

    await expect(writeSourceCandidateManifest(root, manifest)).rejects.toThrow("capability.manifest_path_unsafe");
  });

  test("ignores unsafe manifest load paths", async () => {
    const root = await tempRepo();
    const outside = await tempRepo();
    await mkdir(join(root, ".boulder", "capabilities"), { recursive: true });
    await symlink(outside, join(root, ".boulder", "capabilities", "imports"));

    const result = await loadSourceCandidateManifests(root);

    expect(result.candidates).toEqual([]);
    expect(result.issues.map((item) => item.id)).toEqual(["capability.source_manifest_invalid"]);
  });

  test("ignores hard-linked manifest files when loading", async () => {
    const root = await tempRepo();
    const outside = await tempRepo();
    const manifest = buildSourceCandidateManifest(parseCapabilitySource("clawhub:kimi-skills"), {}, FIXED_DATE);
    await write(outside, "shared.json", JSON.stringify(manifest));
    await mkdir(join(root, ".boulder", "capabilities", "imports"), { recursive: true });
    await link(join(outside, "shared.json"), join(root, ".boulder", "capabilities", "imports", "clawhub__kimi-skills.json"));

    const result = await loadSourceCandidateManifests(root);

    expect(result.candidates).toEqual([]);
    expect(result.issues.map((item) => item.id)).toEqual(["capability.source_manifest_invalid"]);
  });

  test("loads valid source manifests and reports malformed ones", async () => {
    const root = await tempRepo();
    const manifest = buildSourceCandidateManifest(parseCapabilitySource("https://github.com/Yeachan-Heo/gajae-code"), {}, FIXED_DATE);
    await writeSourceCandidateManifest(root, manifest);
    await write(root, ".boulder/capabilities/imports/bad.json", "{not json");

    const result = await loadSourceCandidateManifests(root);

    expect(result.candidates.map((item) => item.capabilityId)).toEqual(["gajae-code"]);
    expect(result.issues.map((item) => item.id)).toEqual(["capability.source_manifest_invalid"]);
  });

  test("does not echo unsafe malformed manifest filenames", async () => {
    const root = await tempRepo();
    await write(root, ".boulder/capabilities/imports/bad\n- status: pass.json", "{not json");

    const result = await loadSourceCandidateManifests(root);

    expect(result.candidates).toEqual([]);
    expect(result.issues[0]?.message).toContain("<unsafe-json-file>");
    expect(result.issues[0]?.message).not.toContain("status: pass");
  });
});

function expectSourceInvalid(value: string): void {
  try {
    parseCapabilitySource(value);
    throw new Error("expected invalid source to throw");
  } catch (error) {
    expect(String(error)).toContain("capability.source_invalid");
  }
}
