import { expect, test } from "bun:test";
import { lstat, readFile, readdir, symlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { removeTempRepo, runBoulder, tempRepo, write } from "./helpers/cli";

const projectRoot = join(import.meta.dir, "..");
const noneFixturePath = join(projectRoot, "fixtures", "v2-kernel", "valid-none-effect-execution.json");
const authorityFixturePath = join(projectRoot, "fixtures", "v2-kernel", "valid-ed25519-authority-unsupported-effect.json");

test("v2 execute is discoverable and runs a none-effect envelope in JSON and human modes", async () => {
  const root = await tempRepo("boulder-v2-cli-");
  try {
    const fixture = await readFile(noneFixturePath, "utf8");
    await write(root, "none.json", fixture);

    const help = await runBoulder(["v2", "--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stderr).toBe("");
    expect(help.stdout).toContain("boulder v2 execute --input path [--cwd directory] [--json]");

    const json = await runBoulder(["v2", "execute", "--input", "none.json", "--json", "--cwd", root]);
    expect(json.exitCode).toBe(0);
    expect(json.stderr).toBe("");
    const result = commandResult(json.stdout);
    expect(result.schemaVersion).toBe("boulder.v2.command-result.v1");
    expect(result.command).toBe("v2 execute");
    expect(result.status).toBe("succeeded");
    expect(result.lifecycle).toBe("critiqued");
    expect(commandResultField(result, "gate").status).toBe("allowed-no-authority");
    expect(commandResultField(result, "result").status).toBe("succeeded");
    expect(commandResultField(result, "critique").verdict).toBe("pass");

    const human = await runBoulder(["v2", "execute", "--cwd", root, "--input", "none.json"]);
    expect(human.exitCode).toBe(0);
    expect(human.stderr).toBe("");
    expect(human.stdout.trim().split("\n")).toEqual([
      "Boulder v2 execute",
      "- status: succeeded",
      "- lifecycle: critiqued",
      "- result: succeeded",
      "- critique: pass",
    ]);
    expect(await readdir(root)).toEqual(["none.json"]);
  } finally {
    await removeTempRepo(root);
  }
});

test("v2 execute accepts route-first global and command options in either command-option order", async () => {
  const root = await tempRepo("boulder-v2-cli-");
  try {
    await write(root, "none.json", await readFile(noneFixturePath, "utf8"));

    for (const args of [
      ["v2", "execute", "--json", "--input", "none.json", "--cwd", root],
      ["v2", "execute", "--cwd", root, "--input", "none.json", "--json"],
    ]) {
      const result = await runBoulder(args);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      const command = commandResult(result.stdout);
      expect(command.status).toBe("succeeded");
      expect(commandResultField(command, "result").status).toBe("succeeded");
    }

    const leadingGlobal = await runBoulder(["--cwd", root, "v2", "execute", "--input", "none.json"]);
    expectV2Error(leadingGlobal, "v2.cli.command.invalid", "Expected: boulder v2 execute --input <path> [--cwd <directory>] [--json].");
    const leadingJson = await runBoulder(["--json", "v2", "execute", "--input", "none.json", "--cwd", root]);
    expectV2JsonError(leadingJson, "v2.cli.command.invalid", "Expected: boulder v2 execute --input <path> [--cwd <directory>] [--json].");
  } finally {
    await removeTempRepo(root);
  }
});

test("v2 execute rejects unknown, duplicate, and missing options before reading input", async () => {
  const root = await tempRepo("boulder-v2-cli-");
  try {
    await write(root, "input.json", "not read\n");
    const cases: readonly [readonly string[], string, string][] = [
      [["v2", "execute", "--input", "input.json", "--unknown"], "v2.cli.option.unknown", "An unsupported option was supplied."],
      [["v2", "execute", "--input", "input.json", "--input", "again.json"], "v2.cli.option.duplicate", "An option may only be supplied once."],
      [["v2", "execute", "--input"], "v2.cli.option.value_missing", "An option requires a value."],
      [["v2", "execute"], "v2.cli.input.required", "--input is required."],
    ];
    for (const [args, id, message] of cases) expectV2Error(await runBoulder(args), id, message);
    expect(await readdir(root)).toEqual(["input.json"]);
  } finally {
    await removeTempRepo(root);
  }
});

test("v2 execute rejects unsafe or malformed inputs without leaking paths or writing", async () => {
  const root = await tempRepo("boulder-v2-cli-");
  const outside = await tempRepo("boulder-v2-secret-outside-");
  try {
    const secret = "v2-secret-must-not-appear";
    await write(root, "malformed.json", `{"token":"${secret}"`);
    await write(root, "duplicate.json", "{\"schemaVersion\":\"first\",\"\\u0073chemaVersion\":\"second\"}");
    await write(root, "too-large.json", "x".repeat(256 * 1024 + 1));
    await write(root, "directory/.keep", "");
    await write(root, "symlink-target.json", "{}");
    await symlink(join(root, "symlink-target.json"), join(root, "link.json"));
    await write(outside, `${secret}.json`, `{"token":"${secret}"}`);
    await write(outside, "ancestor/secret.json", `{"token":"${secret}"}`);
    await symlink(join(outside, "ancestor"), join(root, "outside-ancestor"));
    const overlongInput = "x".repeat(256);

    const malformed = await runBoulder(["v2", "execute", "--input", "malformed.json", "--cwd", root, "--json"]);
    expectV2JsonError(malformed, "v2.cli.input.malformed", "Input must contain valid JSON.");
    expect(`${malformed.stdout}${malformed.stderr}`).not.toContain(secret);
    const duplicate = await runBoulder(["v2", "execute", "--input", "duplicate.json", "--cwd", root, "--json"]);
    expectV2JsonError(duplicate, "v2.cli.input.malformed", "Input must contain valid JSON.");
    expect(`${duplicate.stdout}${duplicate.stderr}`).not.toContain("first");
    expect(`${duplicate.stdout}${duplicate.stderr}`).not.toContain("second");
    const overlongJson = await runBoulder(["v2", "execute", "--input", overlongInput, "--cwd", root, "--json"]);
    expectV2JsonError(overlongJson, "v2.cli.input.unreadable", "Input could not be read.");
    expect(`${overlongJson.stdout}${overlongJson.stderr}`).not.toContain(overlongInput);
    expect(`${overlongJson.stdout}${overlongJson.stderr}`).not.toContain(root);

    const overlongHuman = await runBoulder(["v2", "execute", "--input", overlongInput, "--cwd", root]);
    expectV2Error(overlongHuman, "v2.cli.input.unreadable", "Input could not be read.");
    expect(`${overlongHuman.stdout}${overlongHuman.stderr}`).not.toContain(overlongInput);
    expect(`${overlongHuman.stdout}${overlongHuman.stderr}`).not.toContain(root);

    expectV2Error(await runBoulder(["v2", "execute", "--input", "too-large.json", "--cwd", root]), "v2.cli.input.too_large", "Input exceeds the 256 KiB size limit.");
    expectV2Error(await runBoulder(["v2", "execute", "--input", "directory", "--cwd", root]), "v2.cli.input.path_invalid", "Input path is not permitted.");
    expectV2Error(await runBoulder(["v2", "execute", "--input", "link.json", "--cwd", root]), "v2.cli.input.path_invalid", "Input path is not permitted.");

    const symlinkedAncestorJson = await runBoulder(["v2", "execute", "--input", "outside-ancestor/secret.json", "--cwd", root, "--json"]);
    expectV2JsonError(symlinkedAncestorJson, "v2.cli.input.path_invalid", "Input path is not permitted.");
    expect(`${symlinkedAncestorJson.stdout}${symlinkedAncestorJson.stderr}`).not.toContain(secret);
    expect(`${symlinkedAncestorJson.stdout}${symlinkedAncestorJson.stderr}`).not.toContain(outside);
    expect(`${symlinkedAncestorJson.stdout}${symlinkedAncestorJson.stderr}`).not.toContain(root);

    const symlinkedAncestorHuman = await runBoulder(["v2", "execute", "--input", "outside-ancestor/secret.json", "--cwd", root]);
    expectV2Error(symlinkedAncestorHuman, "v2.cli.input.path_invalid", "Input path is not permitted.");
    expect(`${symlinkedAncestorHuman.stdout}${symlinkedAncestorHuman.stderr}`).not.toContain(secret);
    expect(`${symlinkedAncestorHuman.stdout}${symlinkedAncestorHuman.stderr}`).not.toContain(outside);
    expect(`${symlinkedAncestorHuman.stdout}${symlinkedAncestorHuman.stderr}`).not.toContain(root);

    const traversal = relative(root, join(outside, `${secret}.json`));
    const traversalResult = await runBoulder(["v2", "execute", "--input", traversal, "--cwd", root]);
    expectV2Error(traversalResult, "v2.cli.input.path_invalid", "Input path is not permitted.");
    expect(`${traversalResult.stdout}${traversalResult.stderr}`).not.toContain(secret);

    const absoluteResult = await runBoulder(["v2", "execute", "--input", join(outside, `${secret}.json`), "--cwd", root]);
    expectV2Error(absoluteResult, "v2.cli.input.path_invalid", "Input path is not permitted.");
    expect(`${absoluteResult.stdout}${absoluteResult.stderr}`).not.toContain(secret);

    expect((await readdir(root)).sort()).toEqual(["directory", "duplicate.json", "link.json", "malformed.json", "outside-ancestor", "symlink-target.json", "too-large.json"]);
    await expect(lstat(join(root, ".boulder"))).rejects.toThrow("ENOENT");
  } finally {
    await removeTempRepo(root);
    await removeTempRepo(outside);
  }
});

test("ordinary v2 CLI fails closed when a non-none fixture supplies untrusted authority metadata", async () => {
  const root = await tempRepo("boulder-v2-cli-");
  try {
    const fixture = JSON.parse(await readFile(authorityFixturePath, "utf8")) as { readonly envelope: unknown };
    await write(root, "authority.json", JSON.stringify(fixture.envelope));

    const result = await runBoulder(["v2", "execute", "--input", "authority.json", "--cwd", root]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(result.stdout.trim().split("\n")).toEqual([
      "Boulder v2 execute",
      "- status: blocked",
      "- lifecycle: effect-gated",
      "- failure: v2.authority.verifier_unavailable",
    ]);
    expect(await readdir(root)).toEqual(["authority.json"]);
  } finally {
    await removeTempRepo(root);
  }
});

function commandResult(output: string): Record<string, unknown> {
  const value: unknown = JSON.parse(output);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function commandResultField(result: Record<string, unknown>, field: string): Record<string, unknown> {
  const value = result[field];
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Expected ${field} to be a JSON object.`);
  return value as Record<string, unknown>;
}

function expectV2Error(result: { readonly exitCode: number; readonly stdout: string; readonly stderr: string }, id: string, message: string): void {
  expect(result.exitCode).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.trim()).toBe(`ERROR ${id}: ${message}`);
}

function expectV2JsonError(result: { readonly exitCode: number; readonly stdout: string; readonly stderr: string }, id: string, message: string): void {
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toBe("");
  expect(commandResult(result.stdout)).toEqual({
    schemaVersion: "boulder.error.v1",
    error: { id, message },
  });
}
