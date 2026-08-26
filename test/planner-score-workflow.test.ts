import { expect, test } from "bun:test";
import { planningDigest } from "../src/planning-canonical.js";
import {
  plannerScoreWorkflowEventSigningPayload,
  plannerScoreWorkflowPrivateMapDigest,
  transitionPlannerScoreWorkflow,
  validatePlannerScoreWorkflow,
  type PlannerScoreWorkflowAliasesRevealedEvent,
  type PlannerScoreWorkflowBlindedItem,
  type PlannerScoreWorkflowPreregisterEvent,
  type PlannerScoreWorkflowReportSignedEvent,
  type PlannerScoreWorkflowScoredItem,
  type PlannerScoreWorkflowScoringCompleteEvent,
  type PlannerScoreWorkflowScoredLockEvent,
  type PlannerScoreWorkflowState
} from "../src/planner-score-workflow.js";

const signature = { algorithm: "Ed25519" as const, keyId: "reviewer-key", signature: "structural-only" };
const protocolDigest = planningDigest({ protocol: "prospective-score-study" });

function withEventDigest<T extends { readonly eventDigest: string }>(event: T): T {
  const signingPayload = plannerScoreWorkflowEventSigningPayload(event);
  if (signingPayload === undefined) throw new Error("Event signing payload is required.");
  return { ...event, eventDigest: planningDigest(signingPayload) } as T;
}

function lockDigest(receipt: Omit<NonNullable<PlannerScoreWorkflowScoredLockEvent["scoreLockReceipt"]>, "lockDigest">): string {
  const { signature: _signature, ...unsigned } = receipt;
  return planningDigest(unsigned);
}

function blindedItems(count = 36): readonly PlannerScoreWorkflowBlindedItem[] {
  return Array.from({ length: count }, (_, index) => {
    const reviewItemId = `review-${index + 1}`;
    const plannerAlias = `alias-${index % 3}`;
    return { reviewItemId, plannerAlias, blindedItemDigest: planningDigest({ reviewItemId, plannerAlias }) };
  });
}

function privateMapEntry(reviewItemId: string, index: number): Pick<PlannerScoreWorkflowAliasesRevealedEvent["reveals"][number], "reviewItemId" | "plannerId" | "runId"> {
  return {
    reviewItemId,
    plannerId: `planner-${index % 3}`,
    runId: `run-${index + 1}`
  };
}

function privateMapDigestFor(items: readonly PlannerScoreWorkflowBlindedItem[]): string {
  return plannerScoreWorkflowPrivateMapDigest(items, items.map((item, index) => privateMapEntry(item.reviewItemId, index)));
}

function preregistration(count = 36): PlannerScoreWorkflowPreregisterEvent {
  const items = blindedItems(count);
  const privateMapDigest = privateMapDigestFor(items);
  const event: PlannerScoreWorkflowPreregisterEvent = {
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "preregister-empty-blinded-sheet-lock",
    studyId: "pr8b-fresh-study",
    sequence: 1,
    occurredAt: "2026-07-19T00:00:00.000Z",
    previousStateDigest: null,
    previousEventDigest: null,
    signature,
    blindedItems: items,
    blindedSheetDigest: planningDigest(items),
    privateMapDigest,
    protocolDigest,
    eventDigest: ""
  };
  return withEventDigest(event);
}

function apply(previous: PlannerScoreWorkflowState | undefined, event: unknown): PlannerScoreWorkflowState {
  const result = transitionPlannerScoreWorkflow(previous, event);
  expect(result.valid).toBe(true);
  if (!result.state) throw new Error("Expected a state for an accepted transition.");
  return result.state;
}

function scoringComplete(previous: PlannerScoreWorkflowState): PlannerScoreWorkflowScoringCompleteEvent {
  const scoredItems: readonly PlannerScoreWorkflowScoredItem[] = previous.blindedItems.map((item, index) => {
    const score = 50 + index;
    return {
      reviewItemId: item.reviewItemId,
      blindedItemDigest: item.blindedItemDigest,
      score,
      scoredItemDigest: planningDigest({ reviewItemId: item.reviewItemId, blindedItemDigest: item.blindedItemDigest, score })
    };
  });
  const event: PlannerScoreWorkflowScoringCompleteEvent = {
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "complete-blinded-scoring",
    studyId: previous.studyId,
    sequence: 2,
    occurredAt: "2026-07-19T00:01:00.000Z",
    previousStateDigest: previous.stateDigest,
    previousEventDigest: previous.eventDigest,
    signature,
    protocolDigest,
    privateMapDigest: previous.privateMapDigest,
    scoredItems,
    scoredSheetDigest: planningDigest(scoredItems),
    eventDigest: ""
  };
  return withEventDigest(event);
}

function scoredLock(previous: PlannerScoreWorkflowState): PlannerScoreWorkflowScoredLockEvent {
  if (!previous.scoredItems || !previous.scoredSheetDigest) throw new Error("Scored state is required.");
  const lockedItems = previous.scoredItems.map((item) => ({ reviewItemId: item.reviewItemId, scoredItemDigest: item.scoredItemDigest }));
  const event: PlannerScoreWorkflowScoredLockEvent = {
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "lock-scored-sheet",
    studyId: previous.studyId,
    sequence: 3,
    occurredAt: "2026-07-19T00:02:00.000Z",
    previousStateDigest: previous.stateDigest,
    previousEventDigest: previous.eventDigest,
    signature,
    protocolDigest,
    privateMapDigest: previous.privateMapDigest,
    scoreLockReceipt: (() => {
      const receipt = {
        schemaVersion: "boulder.planner-score-lock-receipt.v1" as const,
        sequence: 3,
        occurredAt: "2026-07-19T00:02:00.000Z",
        kind: "prospective-lock" as const,
        scoreSheetDigest: previous.scoredSheetDigest,
        lockedItems,
        signature
      };
      return { ...receipt, lockDigest: lockDigest(receipt) };
    })(),
    eventDigest: ""
  };
  return withEventDigest(event);
}

function reveal(previous: PlannerScoreWorkflowState): PlannerScoreWorkflowAliasesRevealedEvent {
  if (!previous.scoredItems || !previous.lockDigest) throw new Error("Locked scored state is required.");
  const event: PlannerScoreWorkflowAliasesRevealedEvent = {
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "reveal-aliases",
    studyId: previous.studyId,
    sequence: 4,
    occurredAt: "2026-07-19T00:03:00.000Z",
    previousStateDigest: previous.stateDigest,
    previousEventDigest: previous.eventDigest,
    signature,
    protocolDigest,
    privateMapDigest: previous.privateMapDigest,
    lockDigest: previous.lockDigest,
    reveals: previous.scoredItems.map((item, index) => ({
      ...privateMapEntry(item.reviewItemId, index),
      blindedItemDigest: item.blindedItemDigest,
      scoredItemDigest: item.scoredItemDigest
    })),
    eventDigest: ""
  };
  return withEventDigest(event);
}

function report(previous: PlannerScoreWorkflowState): PlannerScoreWorkflowReportSignedEvent {
  const event: PlannerScoreWorkflowReportSignedEvent = {
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "sign-report",
    studyId: previous.studyId,
    sequence: 5,
    occurredAt: "2026-07-19T00:04:00.000Z",
    previousStateDigest: previous.stateDigest,
    previousEventDigest: previous.eventDigest,
    signature,
    protocolDigest,
    privateMapDigest: previous.privateMapDigest,
    reportDigest: planningDigest({ report: "post-reveal" }),
    eventDigest: ""
  };
  return withEventDigest(event);
}

function validWorkflow(): PlannerScoreWorkflowState {
  const preregistered = apply(undefined, preregistration());
  const scored = apply(preregistered, scoringComplete(preregistered));
  const locked = apply(scored, scoredLock(scored));
  const revealed = apply(locked, reveal(locked));
  return apply(revealed, report(revealed));
}

test("planner score workflow accepts one fully prospective blinded flow", () => {
  const state = validWorkflow();
  expect(state.phase).toBe("report-signed");
  expect(state.events).toHaveLength(5);
  expect(validatePlannerScoreWorkflow(state)).toEqual({ valid: true, issues: [] });
});

test("planner score workflow supports bounded non-scored pilot cohorts", () => {
  const preregistered = apply(undefined, preregistration(6));
  const scored = apply(preregistered, scoringComplete(preregistered));
  const locked = apply(scored, scoredLock(scored));
  const revealed = apply(locked, reveal(locked));
  const state = apply(revealed, report(revealed));
  expect(state.blindedItems).toHaveLength(6);
  expect(validatePlannerScoreWorkflow(state)).toEqual({ valid: true, issues: [] });
});

test("planner score workflow rejects retrospective and post-hoc score locks", () => {
  const preregistered = apply(undefined, preregistration());
  const scored = apply(preregistered, scoringComplete(preregistered));
  const lock = scoredLock(scored);
  const retrospective = withEventDigest({ ...lock, scoreLockReceipt: { ...lock.scoreLockReceipt, kind: "retrospective-attestation" }, eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(scored, retrospective).valid).toBe(false);
  expect(transitionPlannerScoreWorkflow(preregistered, lock).valid).toBe(false);
});

test("planner score workflow rejects reveal and report before the prospective scored lock", () => {
  const preregistered = apply(undefined, preregistration());
  const scored = apply(preregistered, scoringComplete(preregistered));
  const prematureReveal = withEventDigest({
    schemaVersion: "boulder.planner-score-workflow.v1",
    kind: "reveal-aliases" as const,
    studyId: scored.studyId,
    sequence: 3,
    occurredAt: "2026-07-19T00:02:00.000Z",
    previousStateDigest: scored.stateDigest,
    previousEventDigest: scored.eventDigest,
    signature,
    protocolDigest,
    privateMapDigest: scored.privateMapDigest,
    lockDigest: planningDigest({ lock: "not-yet" }),
    reveals: scored.scoredItems?.map((item, index) => ({
      ...privateMapEntry(item.reviewItemId, index),
      blindedItemDigest: item.blindedItemDigest,
      scoredItemDigest: item.scoredItemDigest
    })) ?? [],
    eventDigest: ""
  });
  expect(transitionPlannerScoreWorkflow(scored, prematureReveal).issues.length).toBeGreaterThan(0);
  expect(transitionPlannerScoreWorkflow(scored, report(scored)).valid).toBe(false);
});

test("planner score workflow rejects score changes after lock", () => {
  const preregistered = apply(undefined, preregistration());
  const scored = apply(preregistered, scoringComplete(preregistered));
  const locked = apply(scored, scoredLock(scored));
  const alteredScoring = { ...locked.events[1], scoredItems: locked.scoredItems?.map((item, index) => index === 0 ? { ...item, score: item.score + 1 } : item) };
  const forged = { ...locked, events: [locked.events[0], alteredScoring, locked.events[2]] };
  expect(transitionPlannerScoreWorkflow(forged, reveal(locked)).valid).toBe(false);
});

test("planner score workflow rejects duplicate or missing review identifiers", () => {
  const preregister = preregistration();
  const duplicateItems = [...preregister.blindedItems.slice(0, 35), preregister.blindedItems[0]];
  const duplicate = withEventDigest({ ...preregister, blindedItems: duplicateItems, blindedSheetDigest: planningDigest(duplicateItems), eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(undefined, duplicate).valid).toBe(false);

  const preregistered = apply(undefined, preregister);
  const complete = scoringComplete(preregistered);
  const missingItems = complete.scoredItems.slice(0, 35);
  const missing = withEventDigest({ ...complete, scoredItems: missingItems, scoredSheetDigest: planningDigest(missingItems), eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(preregistered, missing).valid).toBe(false);
});

test("planner score workflow rejects identity leakage before reveal", () => {
  const preregister = preregistration();
  const leakedItem = { ...preregister.blindedItems[0], plannerId: "planner-actual" };
  const leakedItems = [leakedItem, ...preregister.blindedItems.slice(1)];
  const leaked = withEventDigest({ ...preregister, blindedItems: leakedItems, blindedSheetDigest: planningDigest(leakedItems), eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(undefined, leaked).issues[0]?.code).toBe("planner.score_workflow.identity_leak");
});

test("planner score workflow rejects timestamp and digest rollback plus private-map mismatch", () => {
  const preregistered = apply(undefined, preregistration());
  const complete = scoringComplete(preregistered);
  const rollback = withEventDigest({ ...complete, occurredAt: preregistered.occurredAt, eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(preregistered, rollback).valid).toBe(false);

  const digestRollback = withEventDigest({ ...complete, previousEventDigest: planningDigest({ older: true }), eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(preregistered, digestRollback).valid).toBe(false);
  const stateDigestRollback = withEventDigest({ ...complete, previousStateDigest: planningDigest({ olderState: true }), eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(preregistered, stateDigestRollback).valid).toBe(false);

  const scored = apply(preregistered, complete);
  const locked = apply(scored, scoredLock(scored));
  const mapMismatch = withEventDigest({ ...reveal(locked), privateMapDigest: planningDigest({ privateMap: "different" }), eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(locked, mapMismatch).valid).toBe(false);
});
test("planner score workflow excludes signatures from event digests but requires the Ed25519 envelope", () => {
  const event = preregistration();
  const signingPayload = plannerScoreWorkflowEventSigningPayload(event);
  expect(signingPayload !== undefined).toBe(true);
  expect(signingPayload === undefined ? true : "eventDigest" in signingPayload).toBe(false);
  expect(signingPayload === undefined ? true : "signature" in signingPayload).toBe(false);
  expect(withEventDigest({ ...event, signature: { ...signature, signature: "replacement" } }).eventDigest).toBe(event.eventDigest);

  const invalidSignature = withEventDigest({ ...event, signature: { ...signature, algorithm: "RSA" } });
  expect(transitionPlannerScoreWorkflow(undefined, invalidSignature).valid).toBe(false);
});

test("planner score workflow rejects inner lock and reveal tampering", () => {
  const preregistered = apply(undefined, preregistration());
  const scored = apply(preregistered, scoringComplete(preregistered));
  const lock = scoredLock(scored);

  const alteredLockedItem = withEventDigest({
    ...lock,
    scoreLockReceipt: {
      ...lock.scoreLockReceipt,
      lockedItems: [{ ...lock.scoreLockReceipt.lockedItems[0], scoredItemDigest: planningDigest({ altered: true }) }, ...lock.scoreLockReceipt.lockedItems.slice(1)]
    },
    eventDigest: ""
  });
  expect(transitionPlannerScoreWorkflow(scored, alteredLockedItem).valid).toBe(false);

  const alteredLockDigest = withEventDigest({ ...lock, scoreLockReceipt: { ...lock.scoreLockReceipt, lockDigest: planningDigest({ altered: true }) }, eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(scored, alteredLockDigest).valid).toBe(false);

  const alteredLockSignature = withEventDigest({ ...lock, scoreLockReceipt: { ...lock.scoreLockReceipt, signature: { ...signature, signature: "" } }, eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(scored, alteredLockSignature).valid).toBe(false);

  const locked = apply(scored, lock);
  const sourceReveal = reveal(locked);
  const duplicateReveal = withEventDigest({ ...sourceReveal, reveals: [...sourceReveal.reveals.slice(0, 35), sourceReveal.reveals[0]], eventDigest: "" });
  const omittedReveal = withEventDigest({ ...sourceReveal, reveals: sourceReveal.reveals.slice(0, 35), eventDigest: "" });
  const mismatchedReveal = withEventDigest({ ...sourceReveal, reveals: [{ ...sourceReveal.reveals[0], scoredItemDigest: sourceReveal.reveals[1]?.scoredItemDigest ?? sourceReveal.reveals[0].scoredItemDigest }, ...sourceReveal.reveals.slice(1)], eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(locked, duplicateReveal).valid).toBe(false);
  expect(transitionPlannerScoreWorkflow(locked, omittedReveal).valid).toBe(false);
  expect(transitionPlannerScoreWorkflow(locked, mismatchedReveal).valid).toBe(false);
});
test("planner score workflow rejects planner and run opening tampering after recomputing the event digest", () => {
  const preregistered = apply(undefined, preregistration());
  const scored = apply(preregistered, scoringComplete(preregistered));
  const locked = apply(scored, scoredLock(scored));
  const sourceReveal = reveal(locked);
  const tamperedReveal = withEventDigest({
    ...sourceReveal,
    reveals: [{
      ...sourceReveal.reveals[0],
      plannerId: "planner-tampered",
      runId: "run-tampered"
    }, ...sourceReveal.reveals.slice(1)],
    eventDigest: ""
  });

  expect(tamperedReveal.eventDigest).not.toBe(sourceReveal.eventDigest);
  const result = transitionPlannerScoreWorkflow(locked, tamperedReveal);
  expect(result.valid).toBe(false);
  expect(result.issues[0]?.code).toBe("planner.score_workflow.digest_mismatch");
  expect(result.issues[0]?.path).toBe("privateMapDigest");
});

test("planner score workflow binds study, protocol, private-map, and report transitions", () => {
  const preregistered = apply(undefined, preregistration());
  const scored = scoringComplete(preregistered);
  const protocolMismatch = withEventDigest({ ...scored, protocolDigest: planningDigest({ protocol: "other" }), eventDigest: "" });
  const privateMapMismatch = withEventDigest({ ...scored, privateMapDigest: planningDigest({ privateMap: "other" }), eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(preregistered, protocolMismatch).valid).toBe(false);
  expect(transitionPlannerScoreWorkflow(preregistered, privateMapMismatch).valid).toBe(false);

  const completed = apply(preregistered, scored);
  const locked = apply(completed, scoredLock(completed));
  const revealed = apply(locked, reveal(locked));
  const reportMismatch = withEventDigest({ ...report(revealed), studyId: "different-study", eventDigest: "" });
  expect(transitionPlannerScoreWorkflow(revealed, reportMismatch).valid).toBe(false);
});
