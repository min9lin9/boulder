import { link, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

describe("boulder CLI e2e cleanup safety", () => {
  test("rejects unsafe generated root and docs write targets", async () => {
    const rootFile = await tempRepo();
    const manifestFile = await tempRepo();
    const docsDir = await tempRepo();
    const docsFile = await tempRepo();
    const hardlinkRoot = await tempRepo();
    const hardlinkDocs = await tempRepo();
    const symlinkRoot = await tempRepo();
    const external = await tempRepo();
    try {
      const rootAlias = join(symlinkRoot, "workspace-link");
      await symlink(external, rootAlias);
      const symlinkRootResult = await runBoulder(["init", "--cwd", rootAlias, "--force"]);
      expectPathInvalid(symlinkRootResult);
      await expect(readFile(join(external, "BOULDER.md"), "utf8")).rejects.toThrow("ENOENT");

      await write(external, "root.md", "original root\n");
      await symlink(join(external, "root.md"), join(rootFile, "BOULDER.md"));
      const rootResult = await runBoulder(["init", "--cwd", rootFile, "--force"]);
      expectPathInvalid(rootResult);
      expect(await readFile(join(external, "root.md"), "utf8")).toBe("original root\n");

      await write(external, "manifest.yaml", "name: original\n");
      await symlink(join(external, "manifest.yaml"), join(manifestFile, "boulder.yaml"));
      const manifestResult = await runBoulder(["init", "--cwd", manifestFile, "--force"]);
      expectPathInvalid(manifestResult);
      expect(await readFile(join(external, "manifest.yaml"), "utf8")).toBe("name: original\n");

      await mkdir(join(external, "docs-target"), { recursive: true });
      await symlink(join(external, "docs-target"), join(docsDir, "docs"));
      const docsDirResult = await runBoulder(["init", "--cwd", docsDir, "--force"]);
      expectPathInvalid(docsDirResult);

      await runBoulder(["init", "--cwd", docsFile]);
      await write(external, "repo-brief.md", "original brief\n");
      await rm(join(docsFile, "docs", "REPO_BRIEF.md"));
      await symlink(join(external, "repo-brief.md"), join(docsFile, "docs", "REPO_BRIEF.md"));
      const docsFileResult = await runBoulder(["inspect", "--cwd", docsFile]);
      expectPathInvalid(docsFileResult);
      expect(await readFile(join(external, "repo-brief.md"), "utf8")).toBe("original brief\n");

      await write(external, "hard-root.md", "hard root\n");
      await link(join(external, "hard-root.md"), join(hardlinkRoot, "BOULDER.md"));
      const hardRootResult = await runBoulder(["init", "--cwd", hardlinkRoot, "--force"]);
      expectPathInvalid(hardRootResult);
      expect(await readFile(join(external, "hard-root.md"), "utf8")).toBe("hard root\n");

      await runBoulder(["init", "--cwd", hardlinkDocs]);
      await write(external, "hard-doc.md", "hard doc\n");
      await rm(join(hardlinkDocs, "docs", "REPO_BRIEF.md"));
      await link(join(external, "hard-doc.md"), join(hardlinkDocs, "docs", "REPO_BRIEF.md"));
      const hardDocsResult = await runBoulder(["inspect", "--cwd", hardlinkDocs]);
      expectPathInvalid(hardDocsResult);
      expect(await readFile(join(external, "hard-doc.md"), "utf8")).toBe("hard doc\n");
    } finally {
      await removeTempRepo(rootFile);
      await removeTempRepo(manifestFile);
      await removeTempRepo(docsDir);
      await removeTempRepo(docsFile);
      await removeTempRepo(hardlinkRoot);
      await removeTempRepo(hardlinkDocs);
      await removeTempRepo(symlinkRoot);
      await removeTempRepo(external);
    }
  });
});

function expectPathInvalid(result: { readonly exitCode: number; readonly stderr: string }): void {
  expect(result.exitCode).toBe(1);
  expect(result.stderr.trim()).toBe("ERROR fs.path_invalid: Generated file path must stay inside the workspace without symlink or hardlink targets.");
}
