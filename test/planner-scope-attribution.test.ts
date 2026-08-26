import { describe, expect, test } from "bun:test";
import { planningDigest } from "../src/planning-canonical.js";
import {
  canonicalPlannerScopeAttributionUnsignedPayload,
  derivePlannerScopeStatus,
  externalWorkspaceViolationPath,
  validatePlannerScopeAttributionReceipt,
  type PlannerScopeAttributionContext,
  type PlannerScopeAttributionReceipt,
  type PlannerScopeAttributionViolationReason
} from "../src/planner-scope-attribution.js";

const digest = (letter: string): string => `sha256:${letter.repeat(64)}`;

function context(): PlannerScopeAttributionContext {
  const planningPacketBase = {
    runId: "run-1",
    scope: { protectedPaths: ["src/protected/**"] }
  };
  const planningPacket = {
    ...planningPacketBase,
    packetDigest: planningDigest(planningPacketBase)
  };
  const executionPacket = {
    allowedMutationPaths: ["src/**", "test/**"],
    forbiddenPaths: ["src/forbidden/**"]
  };
  return {
    runId: "run-1",
    planningPacket,
    executionPacket,
    preflightReceiptDigest: digest("a"),
    workspaceIdentityDigest: digest("b"),
    authorizedWorkspaceIdentityDigest: digest("b"),
    observedWorkspaceIdentityDigest: digest("b"),
    baselineRevision: "4f7a9c1",
    patchDigest: digest("c")
  };
}

function receipt(
  currentContext = context(),
  overrides: Partial<PlannerScopeAttributionReceipt> = {}
): PlannerScopeAttributionReceipt {
  return {
    schemaVersion: "boulder.planner-scope-attribution-receipt.v1",
    runId: currentContext.runId,
    preflightReceiptDigest: currentContext.preflightReceiptDigest,
    planningPacketDigest: currentContext.planningPacket.packetDigest,
    executionPacketDigest: planningDigest(currentContext.executionPacket),
    authorizedWorkspaceIdentityDigest: currentContext.authorizedWorkspaceIdentityDigest ?? currentContext.workspaceIdentityDigest,
    observedWorkspaceIdentityDigest: currentContext.observedWorkspaceIdentityDigest ?? currentContext.workspaceIdentityDigest,
    baselineRevision: currentContext.baselineRevision,
    patchDigest: currentContext.patchDigest,
    changedPaths: ["src/feature.ts"],
    status: "passed",
    violations: [],
    occurredAt: "2026-07-19T10:00:00Z",
    signature: { algorithm: "Ed25519", keyId: "executor-1", signature: "A".repeat(86) },
    ...overrides
  };
}

function violation(path: string, reason: PlannerScopeAttributionViolationReason) {
  return { path, reason, evidenceDigest: digest("d") };
}

function codes(value: unknown, currentContext = context()): readonly string[] {
  return validatePlannerScopeAttributionReceipt(value, currentContext).map((entry) => entry.code);
}

describe("planner scope attribution receipt", () => {
  test("accepts an in-scope receipt and derives passed only from a verified patch and no violations", () => {
    const currentContext = context();
    const value = receipt(currentContext);
    expect(validatePlannerScopeAttributionReceipt(value, currentContext)).toEqual([]);
    expect(derivePlannerScopeStatus(value)).toBe("passed");
    expect(canonicalPlannerScopeAttributionUnsignedPayload(value)).not.toContain("\"signature\"");
    expect(canonicalPlannerScopeAttributionUnsignedPayload({
      ...value,
      signature: { ...value.signature, signature: "B".repeat(86) }
    })).toBe(canonicalPlannerScopeAttributionUnsignedPayload(value));
  });

  test("accepts legacy authorized-workspace receipts at the integration boundary", () => {
    const currentContext = context();
    const { authorizedWorkspaceIdentityDigest: _authorized, observedWorkspaceIdentityDigest: _observed, ...legacy } = receipt(currentContext);
    expect(validatePlannerScopeAttributionReceipt({
      ...legacy,
      workspaceIdentityDigest: currentContext.workspaceIdentityDigest
    }, currentContext)).toEqual([]);
  });

  test("accepts zero changed paths with a canonical external-workspace violation", () => {
    const currentContext = {
      ...context(),
      observedWorkspaceIdentityDigest: digest("e")
    };
    const value = receipt(currentContext, {
      observedWorkspaceIdentityDigest: digest("e"),
      changedPaths: [],
      status: "failed",
      violations: [violation(externalWorkspaceViolationPath, "external-workspace")]
    });
    expect(validatePlannerScopeAttributionReceipt(value, currentContext)).toEqual([]);
    expect(derivePlannerScopeStatus(value)).toBe("failed");
  });

  test("rejects traversal, absolute, and backslash changed paths", () => {
    for (const path of ["../secrets/token", "/etc/passwd", "src\\escape.ts"]) {
      expect(codes(receipt(context(), { changedPaths: [path] }))).toContain("plan.scope_attribution.path_invalid");
    }
  });

  test("rejects duplicate and unsorted changed paths", () => {
    expect(codes(receipt(context(), { changedPaths: ["test/z.test.ts", "src/a.ts"] }))).toContain("plan.scope_attribution.path_invalid");
    expect(codes(receipt(context(), { changedPaths: ["src/a.ts", "src/a.ts"] }))).toContain("plan.scope_attribution.path_invalid");
  });

  test("rejects binding tampering for run, packet, preflight, workspace, revision, and patch evidence", () => {
    const currentContext = context();
    for (const [overrides, code] of [
      [{ runId: "run-2" }, "plan.scope_attribution.workspace_mismatch"],
      [{ preflightReceiptDigest: digest("e") }, "plan.scope_attribution.digest_mismatch"],
      [{ planningPacketDigest: digest("f") }, "plan.scope_attribution.digest_mismatch"],
      [{ executionPacketDigest: digest("g") }, "plan.scope_attribution.digest_mismatch"],
      [{ authorizedWorkspaceIdentityDigest: digest("h") }, "plan.scope_attribution.workspace_mismatch"],
      [{ observedWorkspaceIdentityDigest: digest("i") }, "plan.scope_attribution.workspace_mismatch"],
      [{ baselineRevision: "different-revision" }, "plan.scope_attribution.workspace_mismatch"],
      [{ patchDigest: digest("j") }, "plan.scope_attribution.digest_mismatch"]
    ] as const) {
      expect(codes(receipt(currentContext, overrides), currentContext)).toContain(code);
    }
  });

  test("requires evidence-backed attribution for protected and out-of-scope paths", () => {
    const currentContext = context();
    const protectedPath = receipt(currentContext, {
      changedPaths: ["src/protected/config.ts"],
      status: "failed",
      violations: [violation("src/protected/config.ts", "protected-path")]
    });
    const forbiddenPath = receipt(currentContext, {
      changedPaths: ["src/forbidden/token.ts"],
      status: "failed",
      violations: [violation("src/forbidden/token.ts", "forbidden-path")]
    });
    const outOfScope = receipt(currentContext, {
      changedPaths: ["docs/readme.md"],
      status: "failed",
      violations: [violation("docs/readme.md", "outside-allowed-paths")]
    });
    expect(validatePlannerScopeAttributionReceipt(protectedPath, currentContext)).toEqual([]);
    expect(validatePlannerScopeAttributionReceipt(forbiddenPath, currentContext)).toEqual([]);
    expect(validatePlannerScopeAttributionReceipt(outOfScope, currentContext)).toEqual([]);
    expect(codes(receipt(currentContext, { changedPaths: ["src/protected/config.ts"] }), currentContext)).toContain("plan.scope_attribution.scope_violation");
    expect(codes(receipt(currentContext, { changedPaths: ["src/forbidden/token.ts"] }), currentContext)).toContain("plan.scope_attribution.scope_violation");
    expect(codes(receipt(currentContext, { changedPaths: ["docs/readme.md"] }), currentContext)).toContain("plan.scope_attribution.scope_violation");
  });

  test("rejects status and violation contradictions", () => {
    const currentContext = context();
    expect(codes(receipt(currentContext, {
      status: "passed",
      violations: [violation("src/feature.ts", "outside-allowed-paths")]
    }), currentContext)).toContain("plan.scope_attribution.status_mismatch");
    expect(codes(receipt(currentContext, { status: "failed" }), currentContext)).toContain("plan.scope_attribution.status_mismatch");
  });

  test("requires exactly one canonical external-workspace violation for a zero-path workspace mismatch", () => {
    const externalContext = { ...context(), observedWorkspaceIdentityDigest: digest("e") };
    expect(codes(receipt(externalContext, {
      observedWorkspaceIdentityDigest: digest("e"),
      changedPaths: [],
      status: "failed",
      violations: []
    }), externalContext)).toContain("plan.scope_attribution.scope_violation");
    expect(codes(receipt(externalContext, {
      observedWorkspaceIdentityDigest: digest("e"),
      changedPaths: [],
      status: "failed",
      violations: [
        violation(externalWorkspaceViolationPath, "external-workspace"),
        violation(externalWorkspaceViolationPath, "external-workspace")
      ]
    }), externalContext)).toContain("plan.scope_attribution.scope_violation");
    expect(codes(receipt(externalContext, {
      observedWorkspaceIdentityDigest: digest("e"),
      changedPaths: [],
      status: "failed",
      violations: [violation("src/feature.ts", "external-workspace")]
    }), externalContext)).toContain("plan.scope_attribution.schema_invalid");
    expect(codes(receipt(context(), {
      changedPaths: [],
      status: "failed",
      violations: [violation(externalWorkspaceViolationPath, "external-workspace")]
    }))).toContain("plan.scope_attribution.scope_violation");
  });
  test("rejects workspace sentinel misuse in changed paths and path-bound violations", () => {
    const currentContext = context();
    expect(codes(receipt(currentContext, {
      changedPaths: [externalWorkspaceViolationPath]
    }), currentContext)).toContain("plan.scope_attribution.path_invalid");
    expect(codes(receipt(currentContext, {
      status: "failed",
      violations: [violation(externalWorkspaceViolationPath, "outside-allowed-paths")]
    }), currentContext)).toContain("plan.scope_attribution.schema_invalid");
  });

  test("rejects malformed signature envelopes and unreadable untrusted input without throwing", () => {
    for (const signature of [
      { algorithm: "Ed25519", keyId: "executor-1", signature: "not-base64url" },
      { algorithm: "Ed25519", keyId: "", signature: "A".repeat(86) },
      { algorithm: "RSA", keyId: "executor-1", signature: "A".repeat(86) },
      { algorithm: "Ed25519", keyId: "executor-1", signature: "A".repeat(85) },
      { algorithm: "Ed25519", keyId: "executor-1", signature: `${"A".repeat(85)}B` },
      { algorithm: "Ed25519", keyId: "executor-1", signature: "A".repeat(86), extra: true }
    ]) {
      expect(codes({ ...receipt(), signature })).toContain("plan.scope_attribution.signature_invalid");
    }
    const unreadable = new Proxy({}, {
      ownKeys() {
        throw new Error("untrusted proxy");
      }
    });
    expect(codes(unreadable)).toEqual(["plan.scope_attribution.schema_invalid"]);
  });

  test("rejects empty patch digests", () => {
    expect(codes(receipt(context(), { patchDigest: "" }))).toContain("plan.scope_attribution.digest_mismatch");
  });
});
