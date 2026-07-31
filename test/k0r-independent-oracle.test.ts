import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { assertIndependentOracleSource, canonicalizeK0r, runK0rIndependentOracle, serializeK0r } from "./k0r-independent-oracle.js";

const root = join(import.meta.dir, "..");
const baselinePath = join(root, "fixtures", "v2-kernel", "valid-ed25519-authority-unsupported-effect.json");
const mutationsPath = join(root, "fixtures", "v2-kernel", "invalid-authority-vectors.json");
const nonePath = join(root, "fixtures", "v2-kernel", "valid-none-effect-execution.json");

async function fixtureBytes() {
  const [baseline, mutations, none] = await Promise.all([readFile(baselinePath, "utf8"), readFile(mutationsPath, "utf8"), readFile(nonePath, "utf8")]);
  return { baseline, mutations, none };
}

test("K0R independently reproduces complete baseline, mutation, and none fixture bytes", async () => {
  const report = await runK0rIndependentOracle({ root });

  expect(report.status).toBe("pass");
  expect(report.reproductionMode).toBe("complete-byte-independent");
  expect(report.artifacts).toEqual({
    baseline: "sha256:0172bc8c3241db159f45b45d5320a466e612856afa2ca6c3478d6d55f5fda750",
    mutations: "sha256:88ed614d1757525c543d86e71b301887b9160465ea9b5126193045d4d0d388ec",
    none: "sha256:df3a2d6da157837886206a2512e50868e1b468b9b48dbcf5ce4bba582cc7c754",
  });
  expect(report.reproduced).toEqual({
    baseline: { sha256: report.artifacts.baseline, fixtureSha256: report.artifacts.baseline, byteMatch: true },
    mutations: { sha256: report.artifacts.mutations, fixtureSha256: report.artifacts.mutations, byteMatch: true },
    none: { sha256: report.artifacts.none, fixtureSha256: report.artifacts.none, byteMatch: true },
  });
  expect(report.generationSetDigest).toBe("sha256:cae1b30b108761597e83350dd359206a87edc629231f7fcbffba9cc599117b65");
  expect(report.derivedPublicKey).toBe("11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo");
  expect(report.seedMaterial.status).toBe("absentOutsideApprovedOracleAndGenerator");
  expect(report.failures).toEqual([]);
});

test("K0R rejects baseline, mutation, and none byte tampering", async () => {
  const fixtures = await fixtureBytes();
  for (const fixtureBytes of [
    { baseline: fixtures.baseline.replace("authority-event-1", "authority-event-x") },
    { mutations: fixtures.mutations.replace('"id":"algorithm-unsupported"', '"id":"algorithm-unsupported-x"') },
    { none: fixtures.none.replace('"workflowId":"workflow-1"', '"workflowId":"workflow-x"') },
  ]) {
    const report = await runK0rIndependentOracle({ root, fixtureBytes });
    expect(report.status).toBe("fail");
    expect(report.failures.join("\n")).toContain("fixture byte digest is not approved");
  }
});

test("K0R loads its source identity from the selected root while remaining independent of the producer generator", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "boulder-k0r-independent-"));
  try {
    const [fixtures, source] = await Promise.all([fixtureBytes(), readFile(join(root, "test", "k0r-independent-oracle.ts"), "utf8")]);
    const fixtureDirectory = join(temporaryRoot, "fixtures", "v2-kernel");
    await Promise.all([mkdir(fixtureDirectory, { recursive: true }), mkdir(join(temporaryRoot, "test"), { recursive: true })]);
    await Promise.all([
      writeFile(join(fixtureDirectory, "valid-ed25519-authority-unsupported-effect.json"), fixtures.baseline),
      writeFile(join(fixtureDirectory, "invalid-authority-vectors.json"), fixtures.mutations),
      writeFile(join(fixtureDirectory, "valid-none-effect-execution.json"), fixtures.none),
      writeFile(join(temporaryRoot, "test", "k0r-independent-oracle.ts"), source),
      writeFile(join(temporaryRoot, "test", "v2-authority-vectors.generate.ts"), "export const tampered = true;\n"),
    ]);

    const report = await runK0rIndependentOracle({ root: temporaryRoot });
    expect(report.status).toBe("pass");
    expect(report.reproduced.baseline.byteMatch).toBe(true);
    expect(report.reproduced.mutations.byteMatch).toBe(true);
    expect(report.reproduced.none.byteMatch).toBe(true);

    await writeFile(join(temporaryRoot, "test", "k0r-independent-oracle.ts"), `${source}\nimport "../src/v2-kernel.js";\n`);
    const tampered = await runK0rIndependentOracle({ root: temporaryRoot });
    expect(tampered.status).toBe("fail");
    expect(tampered.failures.join("\n")).toContain("oracle-source: Oracle source imports product v2 code or the producer generator.");
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("K0R rejects an oracle source that imports product code", async () => {
  const source = await readFile(join(root, "test", "k0r-independent-oracle.ts"), "utf8");
  const report = await runK0rIndependentOracle({ root, oracleSourceBytes: `${source}\nimport "../src/v2-kernel.js";\n` });

  expect(report.status).toBe("fail");
  expect(report.failures.join("\n")).toContain("oracle-source: Oracle source imports product v2 code or the producer generator.");
  expectThrown(() => assertIndependentOracleSource(source.replace("const approvedBaselineSource", "const removedBaselineSource")), "approved baseline source model");
});

test("K0R local JCS serialization has exact LF and I-JSON boundaries", () => {
  expect(canonicalizeK0r({ z: [true, null], a: "value" })).toBe('{"a":"value","z":[true,null]}');
  expect(serializeK0r({ b: "line\nvalue", a: 1 })).toBe('{"a":1,"b":"line\\nvalue"}\n');
  expectThrown(() => canonicalizeK0r({ bad: Number.NaN }), "Numbers must be finite I-JSON values.");
  expectThrown(() => canonicalizeK0r({ bad: "\ud800" }), "Strings cannot contain lone surrogate code points.");
});
function expectThrown(action: () => void, message: string): void {
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    thrown = error;
  }
  expect(thrown instanceof Error).toBe(true);
  if (thrown instanceof Error) expect(thrown.message).toContain(message);
}
