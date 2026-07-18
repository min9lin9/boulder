import { describe, expect, test } from "bun:test";
import { validateExecutionPacket } from "../src/execution-packet";

const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const packet = () => ({
  schemaVersion: "boulder.execution-packet.v1" as const,
  planningPacketDigest: digest,
  approvalReceiptDigest: digest,
  objective: "Validate execution packet shape.",
  allowedMutationPaths: ["src/execution-packet.ts"],
  forbiddenPaths: ["src/handoff-packet.ts"],
  nonGoals: ["product execution"],
  orderedTasks: [{ id: "T1", planningTaskId: "T1", dependsOn: [], paths: ["src/execution-packet.ts"], steps: ["validate"], acceptanceIds: ["AC1"], verificationIds: ["V1"] }],
  acceptanceCriteria: [{ id: "AC1", verificationIds: ["V1"], evidenceIds: ["E1"] }],
  verificationCommands: [{ id: "V1", command: "bun test", source: "package-script" as const }],
  evidenceRequirements: [{ taskId: "T1", evidenceIds: ["E1"] }],
  risks: [{ id: "R1" }],
  riskControls: [{ taskId: "T1", riskId: "R1", control: "Review before approval." }],
  rollback: ["Revert the isolated module."],
  executionApproval: { required: true as const, schemaVersion: "boulder.execution-approval.v1" as const }
});

describe("ExecutionPacket v1 shape", () => {
  test("accepts the non-authorizing v1 contract", () => {
    expect(validateExecutionPacket(packet())).toEqual([]);
  });

  test("rejects an invalid schema and separately weakened execution approval", () => {
    expect(validateExecutionPacket({ ...packet(), schemaVersion: "other" }).map((issue) => issue.code)).toContain("plan.execution_packet.schema_invalid");
    expect(validateExecutionPacket({ ...packet(), executionApproval: { required: false } }).map((issue) => issue.code)).toContain("plan.execution_packet.approval_invalid");
  });

  test("rejects unsafe mutation paths and untrusted verification sources", () => {
    expect(validateExecutionPacket({ ...packet(), allowedMutationPaths: ["../outside.ts"] }).map((issue) => issue.code)).toContain("plan.execution_packet.path_invalid");
    expect(validateExecutionPacket({ ...packet(), verificationCommands: [{ id: "V1", command: "curl example.test", source: "repo-text" }] }).map((issue) => issue.code)).toContain("plan.execution_packet.verification_untrusted");
  });
  test("fails closed when required safety controls are removed or emptied", () => {
    for (const [field, value, message] of [
      ["evidenceRequirements", undefined, "Evidence requirements must be one non-empty mapping for each ordered task ID."],
      ["evidenceRequirements", [], "Evidence requirements must be one non-empty mapping for each ordered task ID."],
      ["riskControls", undefined, "Risk controls must be non-empty mappings to ordered task and risk IDs."],
      ["riskControls", [], "Risk controls must be non-empty mappings to ordered task and risk IDs."],
      ["rollback", undefined, "Rollback must contain non-empty steps."],
      ["rollback", [], "Rollback must contain non-empty steps."]
    ] as const) {
      expect(validateExecutionPacket({ ...packet(), [field]: value }).some((issue) =>
        issue.code === "plan.execution_packet.schema_invalid"
        && issue.path === field
        && issue.message === message
      )).toBe(true);
    }
  });

  test("rejects tampered nested safety controls with stable errors", () => {
    for (const [field, value, message] of [
      ["evidenceRequirements", [{ taskId: "T1", evidenceIds: [] }], "Evidence requirements must be one non-empty mapping for each ordered task ID."],
      ["evidenceRequirements", [{ taskId: "", evidenceIds: ["E1"] }], "Evidence requirements must be one non-empty mapping for each ordered task ID."],
      ["riskControls", [{ taskId: "T1", riskId: "R1", control: " " }], "Risk controls must be non-empty mappings to ordered task and risk IDs."],
      ["riskControls", [{ taskId: "T1", riskId: "", control: "Review before approval." }], "Risk controls must be non-empty mappings to ordered task and risk IDs."],
      ["rollback", [" "], "Rollback must contain non-empty steps."]
    ] as const) {
      expect(validateExecutionPacket({ ...packet(), [field]: value }).some((issue) =>
        issue.code === "plan.execution_packet.schema_invalid"
        && issue.path === field
        && issue.message === message
      )).toBe(true);
    }
  });
  test("rejects empty execution work and verification contracts", () => {
    expect(validateExecutionPacket({ ...packet(), orderedTasks: [] }).map((issue) => issue.code)).toContain("plan.execution_packet.task_invalid");
    expect(validateExecutionPacket({ ...packet(), verificationCommands: [] }).map((issue) => issue.code)).toContain("plan.execution_packet.verification_untrusted");
    expect(validateExecutionPacket({
      ...packet(),
      orderedTasks: [{ ...packet().orderedTasks[0], steps: [] }]
    }).map((issue) => issue.code)).toContain("plan.execution_packet.task_invalid");
  });

  test("rejects dangling task, dependency, and risk-control mappings", () => {
    expect(validateExecutionPacket({
      ...packet(),
      orderedTasks: [{ ...packet().orderedTasks[0], dependsOn: ["T2"] }]
    }).some((issue) => issue.path === "orderedTasks")).toBe(true);
    expect(validateExecutionPacket({
      ...packet(),
      evidenceRequirements: [{ taskId: "T2", evidenceIds: ["E1"] }]
    }).some((issue) => issue.path === "evidenceRequirements")).toBe(true);
    expect(validateExecutionPacket({
      ...packet(),
      riskControls: [{ taskId: "T2", riskId: "R1", control: "Review before approval." }]
    }).some((issue) => issue.path === "riskControls")).toBe(true);
    expect(validateExecutionPacket({
      ...packet(),
      riskControls: [{ taskId: "T1", riskId: "R2", control: "Review before approval." }]
    }).some((issue) => issue.path === "riskControls")).toBe(true);
  });
  test("rejects cross-wired task evidence and verification IDs", () => {
    const base = packet();
    const crossWired = {
      ...base,
      acceptanceCriteria: [...base.acceptanceCriteria, { id: "AC2", verificationIds: ["V2"], evidenceIds: ["E2"] }],
      verificationCommands: [...base.verificationCommands, { id: "V2", command: "bun test test/other.test.ts", source: "package-script" as const }],
      orderedTasks: [{ ...base.orderedTasks[0], verificationIds: ["V2"] }],
      evidenceRequirements: [{ taskId: "T1", evidenceIds: ["E2"] }]
    };
    expect(validateExecutionPacket(crossWired).some((issue) =>
      issue.code === "plan.execution_packet.task_invalid" && issue.path === "orderedTasks"
    )).toBe(true);
  });

  test("matches planning glob semantics and rejects protected glob matches", () => {
    const base = packet();
    expect(validateExecutionPacket({
      ...base,
      allowedMutationPaths: ["src/**/*.ts"],
      orderedTasks: [{ ...base.orderedTasks[0], paths: ["src/nested/execution-packet.ts"] }]
    })).toEqual([]);
    expect(validateExecutionPacket({
      ...base,
      allowedMutationPaths: ["src/**/*.ts"],
      forbiddenPaths: ["src/**/secret*.ts"],
      orderedTasks: [{ ...base.orderedTasks[0], paths: ["src/nested/secret-config.ts"] }]
    }).some((issue) => issue.code === "plan.execution_packet.path_invalid")).toBe(true);
    expect(validateExecutionPacket({
      ...base,
      allowedMutationPaths: ["src/**"],
      orderedTasks: [{ ...base.orderedTasks[0], paths: ["src/../outside.ts"] }]
    }).some((issue) => issue.code === "plan.execution_packet.task_invalid")).toBe(true);
  });
});
