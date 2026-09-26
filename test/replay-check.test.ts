import * as fs from "node:fs/promises";
import * as bunTest from "bun:test";
import { evaluateReplayCheck, replayCheckToMarkdown } from "../src/replay-check";
import { buildReplayRunPlan } from "../src/replay-run";
import { tempRepo, write } from "./helpers/cli";

const { describe, expect, test } = bunTest;
// The repository's minimal bun:test declarations do not include spyOn.
const { spyOn } = bunTest as unknown as {
  spyOn<T, K extends keyof T>(target: T, method: K): {
    mockImplementation(implementation: T[K]): void;
    mockRestore(): void;
  };
};

// Returns a readdir that always hands back codepoint-descending entries, so the
// traversal order is scrambled deterministically no matter what the filesystem does.
function reversedReaddir(): { mockRestore(): void } {
  const read = fs.readdir;
  const spy = spyOn(fs, "readdir");
  spy.mockImplementation(async (path: string) => (await read(path)).sort().reverse());
  return spy;
}

async function writeReplayProject(root: string, project: string): Promise<void> {
  await write(root, `fixtures/replay/${project}/replay.json`, JSON.stringify({
    project,
    repoUrl: `https://github.com/example/${project}`,
    ref: "main",
    officialDocsPath: `fixtures/replay/${project}/official-docs.json`,
    commands: ["bun bin/boulder.ts inspect --cwd . --json"],
    expectedArtifacts: ["docs/REPO_BRIEF.md"],
    evidencePaths: [`docs/CASE_STUDIES/evidence/external-replay/${project}.txt`],
    limitations: ["dry-run replay only"]
  }));
  await write(root, `fixtures/replay/${project}/official-docs.json`, JSON.stringify({
    project,
    repoUrl: `https://github.com/example/${project}`,
    docsUrls: [`https://github.com/example/${project}#readme`],
    versionOrRef: "main",
    setupCommands: ["bun install"],
    testCommands: ["bun test"],
    contributionPolicy: "Use repository README and issues.",
    securityPolicy: "Do not include secrets.",
    constraints: ["No credentials"],
    retrievedAt: new Date(Date.now() - 86_400_000).toISOString()
  }));
  await write(root, `docs/CASE_STUDIES/evidence/external-replay/${project}.txt`, "share-safe replay evidence\n");
}

describe("replay deterministic ordering", () => {
  test("sorts replay-check projects and markdown when readdir is out of order", async () => {
    const root = await tempRepo("boulder-replay-order-");
    await writeReplayProject(root, "zeta-proj");
    await writeReplayProject(root, "alpha-proj");
    await writeReplayProject(root, "mid-proj");
    const spy = reversedReaddir();
    try {
      const report = await evaluateReplayCheck(root);
      const markdown = replayCheckToMarkdown(report);

      expect(report.projects.map((item) => item.project)).toEqual(["alpha-proj", "mid-proj", "zeta-proj"]);
      expect(markdown.split("\n").filter((line) => line.startsWith("- ") && line.includes("-proj"))).toEqual([
        "- alpha-proj: pass - fixtures/replay/alpha-proj/replay.json",
        "- mid-proj: pass - fixtures/replay/mid-proj/replay.json",
        "- zeta-proj: pass - fixtures/replay/zeta-proj/replay.json"
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  test("produces identical replay-check output across different readdir orders", async () => {
    const root = await tempRepo("boulder-replay-order-");
    await writeReplayProject(root, "zeta-proj");
    await writeReplayProject(root, "alpha-proj");
    await writeReplayProject(root, "mid-proj");
    const render = async (scramble: (names: string[]) => string[]): Promise<string> => {
      const read = fs.readdir;
      const spy = spyOn(fs, "readdir");
      spy.mockImplementation(async (path: string) => scramble(await read(path)));
      try {
        return JSON.stringify(await evaluateReplayCheck(root));
      } finally {
        spy.mockRestore();
      }
    };

    const ascending = await render((names) => names.sort());
    const descending = await render((names) => names.sort().reverse());
    const rotated = await render((names) => [...names.slice(1), ...names.slice(0, 1)]);

    expect(descending).toBe(ascending);
    expect(rotated).toBe(ascending);
  });

  test("sorts replay-run projects and issues when readdir is out of order", async () => {
    const root = await tempRepo("boulder-replay-order-");
    await writeReplayProject(root, "zeta-proj");
    await writeReplayProject(root, "alpha-proj");
    await write(root, "fixtures/replay/broken-proj/replay.json", "{}\n");
    await write(root, "fixtures/replay/0-broken/replay.json", "{}\n");
    const spy = reversedReaddir();
    try {
      const plan = await buildReplayRunPlan(root, true);

      expect(plan.projects.map((item) => item.project)).toEqual(["alpha-proj", "zeta-proj"]);
      expect(plan.issues).toEqual([
        "invalid fixtures/replay/0-broken/replay.json",
        "invalid fixtures/replay/broken-proj/replay.json"
      ]);
    } finally {
      spy.mockRestore();
    }
  });
});
