import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  createControlDecisionSeal,
  evaluateControlRun,
  isControlEvidenceManifest,
  isControlPolicy,
  isControlRunEvent,
  validateControlEvidenceManifest,
  validateControlPolicy,
  validateControlRunEvent,
  verifyControlDecisionSeal,
  type ControlEvidenceManifest,
  type ControlPolicy,
  type ControlRunEvent
} from "../src/control-kernel";

const root = join(import.meta.dir, "..");
const fixturePath = join(root, "fixtures/control-kernel/gp-screening-shadow-v0.json");

describe("generic control kernel", () => {
  test("accepts a valid synthetic screening run", async () => {
    const fixture = await loadFixture();
    expect(validateControlPolicy(fixture.policy)).toEqual([]);
    expect(validateControlEvidenceManifest(fixture.manifest)).toEqual([]);
    expect(validateControlRunEvent(fixture.passRun)).toEqual([]);

    const result = await evaluateControlRun(fixture.passRun, fixture.manifest, fixture.policy);
    expect(result.status).toBe("eligible");
    expect(result.issues).toEqual([]);
    expect(result.metricChecks.every((item) => item.status === "pass")).toBe(true);
  });

  test("blocks a critical hard failure even when every metric passes", async () => {
    const fixture = await loadFixture();
    const result = await evaluateControlRun(fixture.hardFailureRun, fixture.manifest, fixture.policy);

    expect(result.status).toBe("blocked");
    expect(result.metricChecks.every((item) => item.status === "pass")).toBe(true);
    expect(result.triggeredHardFailures.map((item) => item.id)).toContain("mandate-exclusion");
    expect(result.triggeredHardFailures.find((item) => item.id === "mandate-exclusion")?.blocked).toBe(true);
  });

  test("blocks a promotion metric miss without a hard failure", async () => {
    const fixture = await loadFixture();
    const result = await evaluateControlRun(fixture.metricFailureRun, fixture.manifest, fixture.policy);

    expect(result.status).toBe("blocked");
    expect(result.triggeredHardFailures).toEqual([]);
    expect(result.metricChecks.find((item) => item.metricId === "risk-recall")?.status).toBe("fail");
  });

  test("fails closed on unknown hard-failure signals and evidence after cutoff", async () => {
    const fixture = await loadFixture();
    const unknownSignal: ControlRunEvent = { ...fixture.passRun, hardFailureSignals: ["unknown.signal"] };
    const signalResult = await evaluateControlRun(unknownSignal, fixture.manifest, fixture.policy);
    expect(signalResult.status).toBe("blocked");
    expect(signalResult.issues).toContain("hard-failure-signal-unregistered:unknown.signal");

    const first = fixture.manifest.entries[0];
    if (!first) throw new Error("Fixture evidence entry is missing.");
    const lateManifest: ControlEvidenceManifest = {
      ...fixture.manifest,
      entries: [{ ...first, observedAt: "2025-01-16T00:00:00.000Z" }, ...fixture.manifest.entries.slice(1)]
    };
    expect(validateControlEvidenceManifest(lateManifest)).toContain("evidence-manifest:entries[0]-after-cutoff");
  });

  test("invalidates a recommendation seal after the run changes", async () => {
    const fixture = await loadFixture();
    const seal = await createControlDecisionSeal(fixture.passRun, fixture.manifest, fixture.policy, "2026-07-18T14:03:00.000Z");
    const valid = await verifyControlDecisionSeal(seal, fixture.passRun, fixture.manifest, fixture.policy);
    expect(valid.status).toBe("valid");

    const changed: ControlRunEvent = {
      ...fixture.passRun,
      metrics: { ...fixture.passRun.metrics, "risk-recall": 0.81 }
    };
    const invalid = await verifyControlDecisionSeal(seal, changed, fixture.manifest, fixture.policy);
    expect(invalid.status).toBe("invalid");
    expect(invalid.issues).toContain("decision-seal:run-hash-mismatch");
  });

  test("rejects a seal when the run-to-evidence binding is inconsistent", async () => {
    const fixture = await loadFixture();
    const seal = await createControlDecisionSeal(fixture.passRun, fixture.manifest, fixture.policy, "2026-07-18T14:03:00.000Z");
    const mismatched: ControlRunEvent = {
      ...fixture.passRun,
      evidenceManifestHash: "8".repeat(64)
    };
    const result = await verifyControlDecisionSeal(seal, mismatched, fixture.manifest, fixture.policy);
    expect(result.status).toBe("invalid");
    expect(result.issues).toContain("binding:evidence-manifest-hash-mismatch");
  });
});

type Fixture = {
  readonly policy: ControlPolicy;
  readonly manifest: ControlEvidenceManifest;
  readonly passRun: ControlRunEvent;
  readonly hardFailureRun: ControlRunEvent;
  readonly metricFailureRun: ControlRunEvent;
};

async function loadFixture(): Promise<Fixture> {
  const parsed: unknown = JSON.parse(await readFile(fixturePath, "utf8"));
  if (!isRecord(parsed) || !isRecord(parsed["runs"])) throw new Error("Invalid control-kernel fixture.");
  const policy = parsed["policy"];
  const manifest = parsed["evidenceManifest"];
  const passRun = parsed["runs"]["pass"];
  const hardFailureRun = parsed["runs"]["hardFailure"];
  const metricFailureRun = parsed["runs"]["metricFailure"];
  if (!isControlPolicy(policy)) throw new Error("Invalid fixture policy.");
  if (!isControlEvidenceManifest(manifest)) throw new Error("Invalid fixture evidence manifest.");
  if (!isControlRunEvent(passRun) || !isControlRunEvent(hardFailureRun) || !isControlRunEvent(metricFailureRun)) {
    throw new Error("Invalid fixture run event.");
  }
  return { policy, manifest, passRun, hardFailureRun, metricFailureRun };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
