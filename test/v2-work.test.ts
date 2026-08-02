import { describe, expect, test } from "bun:test";
import {
  V2_HUMAN_ANSWER_SCHEMA_VERSION,
  V2_PROCEDURE_AUTHORITY_RECEIPT_SCHEMA_VERSION,
  V2_WORK_ACCEPTED_SCHEMA_VERSION,
  V2_WORK_TERMINAL_SCHEMA_VERSION,
  createV2WorkAttempt,
  createV2WorkRevision,
  evaluateV2ProcedureAuthority,
  isV2TerminalWorkReceipt,
  type V2HumanAnswer,
  type V2ProcedureAuthorityBinding,
  type V2ProcedureAuthorityReceipt
} from "../src/v2/work.js";

const digest = (letter: string) => `sha256:${letter.repeat(64)}` as const;

describe("v2 static Work candidate", () => {
  test("keeps revision identity immutable while attempts vary", async () => {
    const resolvedContract = { objective: "prove semantic slice" };
    const first = await createV2WorkRevision({
      workId: "work-one",
      revision: 1,
      procedureDigest: digest("a"),
      resolvedContract
    });
    const repeated = await createV2WorkRevision({
      workId: "work-one",
      revision: 1,
      procedureDigest: digest("a"),
      resolvedContract: { objective: "prove semantic slice" }
    });

    expect(first.ok).toBe(true);
    expect(repeated).toEqual(first);
    if (!first.ok) throw new Error("valid Work revision must build");
    resolvedContract.objective = "mutated after revision";
    expect(first.value.resolvedContract).toEqual({ objective: "prove semantic slice" });
    const attemptOne = createV2WorkAttempt({ attemptId: "attempt-one", attempt: 1, workRevisionDigest: first.value.workRevisionDigest });
    const attemptTwo = createV2WorkAttempt({ attemptId: "attempt-two", attempt: 2, workRevisionDigest: first.value.workRevisionDigest });
    expect(attemptOne.ok).toBe(true);
    expect(attemptTwo.ok).toBe(true);
    if (!attemptOne.ok || !attemptTwo.ok) throw new Error("valid attempts must build");
    expect(attemptOne.value.attemptId).not.toBe(attemptTwo.value.attemptId);
    expect(attemptOne.value.workRevisionDigest).toBe(attemptTwo.value.workRevisionDigest);
  });

  test("rejects non-positive revisions and attempts", async () => {
    const revision = await createV2WorkRevision({
      workId: "work-one",
      revision: 0,
      procedureDigest: digest("a"),
      resolvedContract: {}
    });
    const attempt = createV2WorkAttempt({ attemptId: "attempt-one", attempt: 0, workRevisionDigest: digest("b") });
    const injected = createV2WorkAttempt({
      attemptId: "attempt-one",
      attempt: 1,
      workRevisionDigest: digest("b"),
      schemaVersion: "attacker.v1"
    } as never);
    expect(revision).toEqual({ ok: false, reasonCode: "v2.work.revision_invalid" });
    expect(attempt).toEqual({ ok: false, reasonCode: "v2.work.attempt_invalid" });
    expect(injected).toEqual({ ok: false, reasonCode: "v2.work.attempt_invalid" });
  });

  test("accepted receipts are never terminal receipts", () => {
    const accepted = {
      schemaVersion: V2_WORK_ACCEPTED_SCHEMA_VERSION,
      attemptId: "attempt-one",
      workRevisionDigest: digest("b"),
      acceptedAt: "2026-07-31T00:00:00.000Z"
    };
    const terminal = {
      schemaVersion: V2_WORK_TERMINAL_SCHEMA_VERSION,
      attemptId: "attempt-one",
      workRevisionDigest: digest("b"),
      status: "completed",
      terminalAt: "2026-07-31T00:01:00.000Z"
    };
    expect(isV2TerminalWorkReceipt(accepted)).toBe(false);
    expect(isV2TerminalWorkReceipt(terminal)).toBe(true);
  });

  test("Human answers cannot satisfy edge-scoped Approval authority", () => {
    const required: V2ProcedureAuthorityBinding = {
      workRevisionDigest: digest("b"),
      edgeId: "loop-human",
      policyDigest: digest("c"),
      action: "complete-loop"
    };
    const answer: V2HumanAnswer = {
      schemaVersion: V2_HUMAN_ANSWER_SCHEMA_VERSION,
      occurrenceId: "human-task",
      answer: "approve",
      answeredAt: "2026-07-31T00:00:30.000Z"
    };
    expect(evaluateV2ProcedureAuthority(required, answer, () => true)).toEqual({
      allowed: false,
      reasonCode: "v2.work.approval_receipt_required"
    });
  });

  test("requires an exact revision, occurrence edge, policy, and action binding", () => {
    const required: V2ProcedureAuthorityBinding = {
      workRevisionDigest: digest("b"),
      edgeId: "loop-human",
      policyDigest: digest("c"),
      action: "complete-loop"
    };
    const receipt: V2ProcedureAuthorityReceipt = {
      schemaVersion: V2_PROCEDURE_AUTHORITY_RECEIPT_SCHEMA_VERSION,
      ...required,
      approvalDigest: digest("d")
    };
    expect(evaluateV2ProcedureAuthority(required, receipt, () => false)).toEqual({
      allowed: false,
      reasonCode: "v2.work.approval_untrusted"
    });
    expect(evaluateV2ProcedureAuthority(required, receipt, (candidate) =>
      candidate.approvalDigest === digest("d")
      && candidate.workRevisionDigest === required.workRevisionDigest
      && candidate.edgeId === required.edgeId
      && candidate.policyDigest === required.policyDigest
      && candidate.action === required.action
    )).toEqual({ allowed: true });
    const issuedForOtherEdge: V2ProcedureAuthorityReceipt = { ...receipt, edgeId: "issued-edge" };
    expect(evaluateV2ProcedureAuthority(required, receipt, (candidate) =>
      candidate.approvalDigest === issuedForOtherEdge.approvalDigest
      && candidate.workRevisionDigest === issuedForOtherEdge.workRevisionDigest
      && candidate.edgeId === issuedForOtherEdge.edgeId
      && candidate.policyDigest === issuedForOtherEdge.policyDigest
      && candidate.action === issuedForOtherEdge.action
    )).toEqual({
      allowed: false,
      reasonCode: "v2.work.approval_untrusted"
    });
    for (const mismatch of [
      { ...receipt, workRevisionDigest: digest("e") },
      { ...receipt, edgeId: "other-edge" },
      { ...receipt, policyDigest: digest("f") }
    ]) {
      expect(evaluateV2ProcedureAuthority(required, mismatch, () => true)).toEqual({
        allowed: false,
        reasonCode: "v2.work.authority_binding_mismatch"
      });
    }
    expect(evaluateV2ProcedureAuthority(required, { ...receipt, unexpected: true }, () => true)).toEqual({
      allowed: false,
      reasonCode: "v2.work.approval_receipt_invalid"
    });
  });
});
