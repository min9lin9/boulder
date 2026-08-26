import { expect, test } from "bun:test";
import {
  commonExecutorFinalReceiptSigningPayload,
  transitionCommonExecutorLifecycle,
  validateCommonExecutorFinalReceipt,
  validateCommonExecutorLifecycle,
  type CommonExecutorEventInput,
  type CommonExecutorFinalReceipt,
  type CommonExecutorLifecycle,
  type CommonExecutorLifecycleInput,
  type CommonExecutorTermination
} from "../src/common-executor-evidence";
import { planningDigest } from "../src/planning-canonical";

const digest = (letter: string) => `sha256:${letter.repeat(64)}`;

function transition(lifecycle: CommonExecutorLifecycleInput, input: CommonExecutorEventInput): CommonExecutorLifecycle {
  const result = transitionCommonExecutorLifecycle(lifecycle, input);
  if (!result.valid || !result.value) throw new Error(result.issues.map((entry) => entry.message).join("; "));
  return result.value;
}

function lifecycle(termination: CommonExecutorTermination = exitTermination()): CommonExecutorLifecycle {
  const base = { runId: "run-1", command: "bun test", cwd: "/repo", budgetSeconds: 30 };
  let current: CommonExecutorLifecycle = transition(base, {
    ...base,
    phase: "preflight-passed",
    timestamp: "2026-07-19T00:00:00.000Z",
    preflightDigest: digest("a")
  });
  current = transition(current, { ...base, phase: "started", timestamp: "2026-07-19T00:00:01.000Z" });
  current = transition(current, { ...base, phase: "terminated", timestamp: "2026-07-19T00:00:02.000Z", termination });
  current = transition(current, {
    ...base,
    phase: "verified",
    timestamp: "2026-07-19T00:00:03.000Z",
    verification: verification()
  });
  return transition(current, { ...base, phase: "finalized", timestamp: "2026-07-19T00:00:04.000Z" });
}

function exitTermination(): CommonExecutorTermination {
  return { kind: "exit", exitCode: 0, stdoutDigest: digest("b"), stderrDigest: digest("c") };
}

function verification() {
  return {
    test: { outcome: "passed" as const, digest: digest("d") },
    typecheck: { outcome: "passed" as const, digest: digest("e") },
    artifactDigests: [digest("f")]
  };
}

function receipt(source: CommonExecutorLifecycle): CommonExecutorFinalReceipt {
  const value = {
    schemaVersion: "boulder.common-executor-final-receipt.v2" as const,
    runId: source.runId,
    command: source.command,
    cwd: source.cwd,
    budgetSeconds: source.budgetSeconds,
    lifecycleDigest: source.lifecycleDigest,
    headEventDigest: source.headEventDigest,
    finalizedAt: source.events[4]!.timestamp,
    termination: source.events[2]!.termination!,
    verification: source.events[3]!.verification!,
    receiptDigest: "",
    signature: { algorithm: "Ed25519" as const, keyId: "fixture", signature: "structural-only" }
  };
  const { receiptDigest: _receiptDigest, signature: _signature, ...unsigned } = value;
  return { ...value, receiptDigest: planningDigest(unsigned) };
}
function withReceiptDigest(value: CommonExecutorFinalReceipt): CommonExecutorFinalReceipt {
  const { receiptDigest: _receiptDigest, signature: _signature, ...unsigned } = value;
  return { ...value, receiptDigest: planningDigest(unsigned) };
}

test("accepts only the complete monotonic lifecycle and structurally bound final receipt", () => {
  const source = lifecycle();
  expect(validateCommonExecutorLifecycle(source).valid).toBe(true);
  expect(validateCommonExecutorFinalReceipt(receipt(source), source).valid).toBe(true);
});

test("rejects skipped, reordered, and replayed lifecycle events", () => {
  const source = lifecycle();
  const skipped = { ...source, events: [source.events[0], source.events[2], source.events[3], source.events[4]] };
  const reordered = { ...source, events: [source.events[0], source.events[2], source.events[1], source.events[3], source.events[4]] };
  const replayed = { ...source, events: [...source.events, source.events[4]] };
  expect(validateCommonExecutorLifecycle(skipped).valid).toBe(false);
  expect(validateCommonExecutorLifecycle(reordered).valid).toBe(false);
  expect(validateCommonExecutorLifecycle(replayed).valid).toBe(false);
});

test("rejects missing exit, signal, and timeout facts", () => {
  const exit = lifecycle();
  const missingExit = { ...exit, events: exit.events.map((event, index) => index === 2 ? { ...event, termination: { ...event.termination!, exitCode: undefined } } : event) };
  const signal = lifecycle({ kind: "signal", signal: "SIGTERM", stdoutDigest: digest("b"), stderrDigest: digest("c") });
  const missingSignal = { ...signal, events: signal.events.map((event, index) => index === 2 ? { ...event, termination: { ...event.termination!, signal: undefined } } : event) };
  const timeout = lifecycle({ kind: "timeout", timeoutAt: "2026-07-19T00:00:02.000Z", stdoutDigest: digest("b"), stderrDigest: digest("c") });
  const missingTimeout = { ...timeout, events: timeout.events.map((event, index) => index === 2 ? { ...event, termination: { ...event.termination!, timeoutAt: undefined } } : event) };
  expect(validateCommonExecutorLifecycle(missingExit).valid).toBe(false);
  expect(validateCommonExecutorLifecycle(missingSignal).valid).toBe(false);
  expect(validateCommonExecutorLifecycle(missingTimeout).valid).toBe(false);
});

test("rejects empty or missing output digests, reversed timestamps, and broken digests", () => {
  const source = lifecycle();
  const emptyStdout = { ...source, events: source.events.map((event, index) => index === 2 ? { ...event, termination: { ...event.termination!, stdoutDigest: "" } } : event) };
  const missingStderr = { ...source, events: source.events.map((event, index) => index === 2 ? { ...event, termination: { kind: "exit", exitCode: 0, stdoutDigest: digest("b") } } : event) };
  const reversedTime = { ...source, events: source.events.map((event, index) => index === 3 ? { ...event, timestamp: "2026-07-19T00:00:01.000Z" } : event) };
  const brokenDigest = { ...source, events: source.events.map((event, index) => index === 2 ? { ...event, eventDigest: digest("0") } : event) };
  expect(validateCommonExecutorLifecycle(emptyStdout).valid).toBe(false);
  expect(validateCommonExecutorLifecycle(missingStderr).valid).toBe(false);
  expect(validateCommonExecutorLifecycle(reversedTime).valid).toBe(false);
  expect(validateCommonExecutorLifecycle(brokenDigest).valid).toBe(false);
});

test("accepts approval-cycle terminal evidence only when fully bound", () => {
  const source = lifecycle({ kind: "approval-cycle", approvalCycleDigest: digest("9"), stdoutDigest: digest("b"), stderrDigest: digest("c") });
  expect(validateCommonExecutorLifecycle(source).valid).toBe(true);
  expect(validateCommonExecutorFinalReceipt(receipt(source), source).valid).toBe(true);
});

test("rejects every tampered final-receipt lifecycle binding", () => {
  const source = lifecycle();
  const validReceipt = receipt(source);
  const invalidReceipts = [
    withReceiptDigest({ ...validReceipt, runId: "run-2" }),
    withReceiptDigest({ ...validReceipt, command: "bunx tsc --noEmit" }),
    withReceiptDigest({ ...validReceipt, cwd: "/other-repo" }),
    withReceiptDigest({ ...validReceipt, budgetSeconds: 31 }),
    withReceiptDigest({ ...validReceipt, lifecycleDigest: digest("0") }),
    withReceiptDigest({ ...validReceipt, headEventDigest: digest("0") }),
    withReceiptDigest({ ...validReceipt, finalizedAt: "2026-07-19T00:00:05.000Z" }),
    withReceiptDigest({ ...validReceipt, termination: { ...validReceipt.termination, stdoutDigest: digest("0") } }),
    withReceiptDigest({ ...validReceipt, verification: { ...validReceipt.verification, test: { ...validReceipt.verification.test, outcome: "failed" as const } } }),
    { ...validReceipt, receiptDigest: digest("0") },
    { ...validReceipt, signature: { algorithm: "RSA", keyId: "fixture", signature: "structural-only" } },
    { ...validReceipt, signature: { algorithm: "Ed25519" as const, keyId: "fixture", signature: "" } },
    { ...validReceipt, signature: { algorithm: "Ed25519" as const, keyId: "", signature: "structural-only" } },
    { ...validReceipt, signature: { algorithm: "Ed25519" as const, keyId: "fixture", signature: "structural-only", extra: "unsupported" } }
  ];
  for (const invalidReceipt of invalidReceipts) {
    expect(validateCommonExecutorFinalReceipt(invalidReceipt, source).valid).toBe(false);
  }
  expect(validateCommonExecutorFinalReceipt(validReceipt, { ...source, lifecycleDigest: digest("0") }).valid).toBe(false);
});

test("exports a stable external signing payload without the signature envelope", () => {
  const validReceipt = receipt(lifecycle());
  const signingPayload = commonExecutorFinalReceiptSigningPayload(validReceipt);
  expect(signingPayload).toEqual({
    schemaVersion: validReceipt.schemaVersion,
    runId: validReceipt.runId,
    command: validReceipt.command,
    cwd: validReceipt.cwd,
    budgetSeconds: validReceipt.budgetSeconds,
    lifecycleDigest: validReceipt.lifecycleDigest,
    headEventDigest: validReceipt.headEventDigest,
    finalizedAt: validReceipt.finalizedAt,
    termination: validReceipt.termination,
    verification: validReceipt.verification,
    receiptDigest: validReceipt.receiptDigest
  });
  expect(planningDigest(signingPayload)).toBe(planningDigest(commonExecutorFinalReceiptSigningPayload({
    ...validReceipt,
    signature: { algorithm: "Ed25519", keyId: "other-key", signature: "other-signature" }
  })));
});

test("rejects final receipts for non-finalized lifecycles", () => {
  const base = { runId: "run-1", command: "bun test", cwd: "/repo", budgetSeconds: 30 };
  let incomplete = transition(base, {
    ...base,
    phase: "preflight-passed",
    timestamp: "2026-07-19T00:00:00.000Z",
    preflightDigest: digest("a")
  });
  incomplete = transition(incomplete, { ...base, phase: "started", timestamp: "2026-07-19T00:00:01.000Z" });
  incomplete = transition(incomplete, { ...base, phase: "terminated", timestamp: "2026-07-19T00:00:02.000Z", termination: exitTermination() });
  incomplete = transition(incomplete, {
    ...base,
    phase: "verified",
    timestamp: "2026-07-19T00:00:03.000Z",
    verification: verification()
  });
  expect(validateCommonExecutorFinalReceipt(receipt(lifecycle()), incomplete).valid).toBe(false);
});
