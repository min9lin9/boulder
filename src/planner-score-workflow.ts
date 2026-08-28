import { planningDigest } from "./planning-canonical.js";

const schemaVersion = "boulder.planner-score-workflow.v1" as const;
const scoreLockReceiptSchemaVersion = "boulder.planner-score-lock-receipt.v1" as const;

export type PlannerScoreWorkflowPhase =
  | "preregistered-empty-blinded-sheet-locked"
  | "blinded-scoring-complete"
  | "scored-sheet-locked"
  | "aliases-revealed"
  | "report-signed";

export type PlannerScoreWorkflowEventKind =
  | "preregister-empty-blinded-sheet-lock"
  | "complete-blinded-scoring"
  | "lock-scored-sheet"
  | "reveal-aliases"
  | "sign-report";

export type PlannerScoreWorkflowIssueCode =
  | "planner.score_workflow.state_invalid"
  | "planner.score_workflow.event_invalid"
  | "planner.score_workflow.transition_invalid"
  | "planner.score_workflow.identity_leak"
  | "planner.score_workflow.digest_mismatch"
  | "planner.score_workflow.timestamp_rollback";

export interface PlannerScoreWorkflowIssue {
  readonly code: PlannerScoreWorkflowIssueCode;
  readonly path: string;
  readonly message: string;
}

export interface PlannerScoreWorkflowValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PlannerScoreWorkflowIssue[];
}

export interface PlannerScoreWorkflowTransitionResult extends PlannerScoreWorkflowValidationResult {
  readonly state?: PlannerScoreWorkflowState;
}

export interface PlannerScoreWorkflowSignature {
  readonly algorithm: "Ed25519";
  readonly keyId: string;
  readonly signature: string;
}

export interface PlannerScoreWorkflowBlindedItem {
  readonly reviewItemId: string;
  readonly plannerAlias: string;
  readonly blindedItemDigest: string;
}

export interface PlannerScoreWorkflowScoredItem {
  readonly reviewItemId: string;
  readonly blindedItemDigest: string;
  readonly score: number;
  readonly scoredItemDigest: string;
}

export interface PlannerScoreWorkflowLockedItem {
  readonly reviewItemId: string;
  readonly scoredItemDigest: string;
}

export interface PlannerScoreWorkflowReveal {
  readonly reviewItemId: string;
  readonly plannerId: string;
  readonly runId: string;
  readonly blindedItemDigest: string;
  readonly scoredItemDigest: string;
}

export interface PlannerScoreWorkflowLockReceipt {
  readonly schemaVersion: typeof scoreLockReceiptSchemaVersion;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly kind: "prospective-lock";
  readonly scoreSheetDigest: string;
  readonly lockDigest: string;
  readonly lockedItems: readonly PlannerScoreWorkflowLockedItem[];
  readonly signature: PlannerScoreWorkflowSignature;
}

interface PlannerScoreWorkflowEventBase {
  readonly schemaVersion: typeof schemaVersion;
  readonly studyId: string;
  readonly protocolDigest: string;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly previousStateDigest: string | null;
  readonly previousEventDigest: string | null;
  readonly privateMapDigest: string;
  readonly signature: PlannerScoreWorkflowSignature;
  readonly eventDigest: string;
}

export interface PlannerScoreWorkflowPreregisterEvent extends PlannerScoreWorkflowEventBase {
  readonly kind: "preregister-empty-blinded-sheet-lock";
  readonly blindedItems: readonly PlannerScoreWorkflowBlindedItem[];
  readonly blindedSheetDigest: string;
}

export interface PlannerScoreWorkflowScoringCompleteEvent extends PlannerScoreWorkflowEventBase {
  readonly kind: "complete-blinded-scoring";
  readonly scoredItems: readonly PlannerScoreWorkflowScoredItem[];
  readonly scoredSheetDigest: string;
}

export interface PlannerScoreWorkflowScoredLockEvent extends PlannerScoreWorkflowEventBase {
  readonly kind: "lock-scored-sheet";
  readonly scoreLockReceipt: PlannerScoreWorkflowLockReceipt;
}

export interface PlannerScoreWorkflowAliasesRevealedEvent extends PlannerScoreWorkflowEventBase {
  readonly kind: "reveal-aliases";
  readonly lockDigest: string;
  readonly reveals: readonly PlannerScoreWorkflowReveal[];
}

export interface PlannerScoreWorkflowReportSignedEvent extends PlannerScoreWorkflowEventBase {
  readonly kind: "sign-report";
  readonly reportDigest: string;
}

export type PlannerScoreWorkflowEvent =
  | PlannerScoreWorkflowPreregisterEvent
  | PlannerScoreWorkflowScoringCompleteEvent
  | PlannerScoreWorkflowScoredLockEvent
  | PlannerScoreWorkflowAliasesRevealedEvent
  | PlannerScoreWorkflowReportSignedEvent;

export interface PlannerScoreWorkflowState {
  readonly schemaVersion: typeof schemaVersion;
  readonly studyId: string;
  readonly protocolDigest: string;
  readonly phase: PlannerScoreWorkflowPhase;
  readonly sequence: number;
  readonly occurredAt: string;
  readonly previousStateDigest: string | null;
  readonly previousEventDigest: string | null;
  readonly eventDigest: string;
  readonly signature: PlannerScoreWorkflowSignature;
  readonly events: readonly PlannerScoreWorkflowEvent[];
  readonly blindedItems: readonly PlannerScoreWorkflowBlindedItem[];
  readonly blindedSheetDigest: string;
  readonly privateMapDigest: string;
  readonly scoredItems?: readonly PlannerScoreWorkflowScoredItem[];
  readonly scoredSheetDigest?: string;
  readonly scoreLockReceipt?: PlannerScoreWorkflowLockReceipt;
  readonly reveals?: readonly PlannerScoreWorkflowReveal[];
  readonly lockDigest?: string;
  readonly reportDigest?: string;
  readonly stateDigest: string;
}

type JsonRecord = Record<string, unknown>;

const phases: readonly PlannerScoreWorkflowPhase[] = [
  "preregistered-empty-blinded-sheet-locked",
  "blinded-scoring-complete",
  "scored-sheet-locked",
  "aliases-revealed",
  "report-signed"
];

const eventKinds: readonly PlannerScoreWorkflowEventKind[] = [
  "preregister-empty-blinded-sheet-lock",
  "complete-blinded-scoring",
  "lock-scored-sheet",
  "reveal-aliases",
  "sign-report"
];

function issue(code: PlannerScoreWorkflowIssueCode, path: string, message: string): PlannerScoreWorkflowIssue {
  return { code, path, message };
}

function object(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function safePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isoTime(value: unknown): value is string {
  return text(value) && !Number.isNaN(Date.parse(value));
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

export function plannerScoreWorkflowPrivateMapDigest(
  blindedItems: readonly PlannerScoreWorkflowBlindedItem[],
  reveals: readonly Pick<PlannerScoreWorkflowReveal, "reviewItemId" | "plannerId" | "runId">[]
): string {
  const aliasesByReviewItemId = new Map<string, string>();
  for (const item of blindedItems) aliasesByReviewItemId.set(item.reviewItemId, item.plannerAlias);
  const privateMappings = reveals.map((reveal) => ({
    reviewItemId: reveal.reviewItemId,
    plannerAlias: aliasesByReviewItemId.get(reveal.reviewItemId) ?? "",
    plannerId: reveal.plannerId,
    runId: reveal.runId
  }));
  privateMappings.sort((left, right) => left.reviewItemId.localeCompare(right.reviewItemId));
  return planningDigest(privateMappings);
}

export function plannerScoreWorkflowEventSigningPayload(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!object(value)) return undefined;
  try {
    const payload: JsonRecord = Object.create(null);
    for (const [key, entry] of Object.entries(value)) {
      if (key !== "eventDigest" && key !== "signature") payload[key] = entry;
    }
    return payload;
  } catch {
    return undefined;
  }
}

function canonicalDigest(value: JsonRecord, omitted: readonly string[]): string {
  const copy: JsonRecord = Object.create(null);
  for (const [key, entry] of Object.entries(value)) if (!omitted.includes(key)) copy[key] = entry;
  return planningDigest(copy);
}

function signatureShape(value: unknown): value is PlannerScoreWorkflowSignature {
  return object(value)
    && exactKeys(value, ["algorithm", "keyId", "signature"])
    && value.algorithm === "Ed25519"
    && text(value.keyId)
    && text(value.signature);
}

function blindedItemShape(value: unknown): value is PlannerScoreWorkflowBlindedItem {
  return object(value)
    && exactKeys(value, ["blindedItemDigest", "plannerAlias", "reviewItemId"])
    && text(value.reviewItemId)
    && text(value.plannerAlias)
    && digest(value.blindedItemDigest)
    && value.blindedItemDigest === planningDigest({ reviewItemId: value.reviewItemId, plannerAlias: value.plannerAlias });
}

function scoredItemShape(value: unknown): value is PlannerScoreWorkflowScoredItem {
  return object(value)
    && exactKeys(value, ["blindedItemDigest", "reviewItemId", "score", "scoredItemDigest"])
    && text(value.reviewItemId)
    && digest(value.blindedItemDigest)
    && finiteNumber(value.score)
    && digest(value.scoredItemDigest)
    && value.scoredItemDigest === planningDigest({
      reviewItemId: value.reviewItemId,
      blindedItemDigest: value.blindedItemDigest,
      score: value.score
    });
}

function lockedItemShape(value: unknown): value is PlannerScoreWorkflowLockedItem {
  return object(value)
    && exactKeys(value, ["reviewItemId", "scoredItemDigest"])
    && text(value.reviewItemId)
    && digest(value.scoredItemDigest);
}

function revealShape(value: unknown): value is PlannerScoreWorkflowReveal {
  return object(value)
    && exactKeys(value, ["blindedItemDigest", "plannerId", "reviewItemId", "runId", "scoredItemDigest"])
    && text(value.reviewItemId)
    && text(value.plannerId)
    && text(value.runId)
    && digest(value.blindedItemDigest)
    && digest(value.scoredItemDigest);
}

function lockReceiptShape(value: unknown): value is PlannerScoreWorkflowLockReceipt {
  if (!object(value) || !exactKeys(value, ["kind", "lockDigest", "lockedItems", "occurredAt", "schemaVersion", "scoreSheetDigest", "sequence", "signature"])) return false;
  if (value.schemaVersion !== scoreLockReceiptSchemaVersion || value.kind !== "prospective-lock" || !safePositiveInteger(value.sequence) || !isoTime(value.occurredAt) || !digest(value.scoreSheetDigest) || !digest(value.lockDigest) || !signatureShape(value.signature) || !Array.isArray(value.lockedItems) || !value.lockedItems.every(lockedItemShape)) return false;
  const reviewItemIds = new Set<string>();
  return value.lockDigest === canonicalDigest(value, ["lockDigest", "signature"])
    && value.lockedItems.every((entry) => !reviewItemIds.has(entry.reviewItemId) && Boolean(reviewItemIds.add(entry.reviewItemId)));
}

function eventBaseShape(value: JsonRecord): boolean {
  const signingPayload = plannerScoreWorkflowEventSigningPayload(value);
  return value.schemaVersion === schemaVersion
    && text(value.studyId)
    && digest(value.protocolDigest)
    && safePositiveInteger(value.sequence)
    && isoTime(value.occurredAt)
    && (value.previousStateDigest === null || digest(value.previousStateDigest))
    && (value.previousEventDigest === null || digest(value.previousEventDigest))
    && digest(value.privateMapDigest)
    && signatureShape(value.signature)
    && digest(value.eventDigest)
    && signingPayload !== undefined
    && value.eventDigest === planningDigest(signingPayload);
}

function sameIds<T extends { readonly reviewItemId: string }>(items: readonly T[], expected: ReadonlySet<string>): boolean {
  const ids = new Set<string>();
  return items.length === expected.size
    && items.every((item) => !ids.has(item.reviewItemId) && Boolean(ids.add(item.reviewItemId)))
    && [...expected].every((reviewItemId) => ids.has(reviewItemId));
}

const identityFields = new Set(["identity", "identityid", "plannerid", "runid"]);

function identityLeakPath(value: unknown, path = "$"): string | undefined {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries()) {
      const nested = identityLeakPath(entry, `${path}[${index}]`);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }
  if (!object(value)) return undefined;
  for (const [key, entry] of Object.entries(value)) {
    if (identityFields.has(key.toLowerCase())) return `${path}.${key}`;
    const nested = identityLeakPath(entry, `${path}.${key}`);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function validateEventShape(value: unknown): readonly PlannerScoreWorkflowIssue[] {
  if (!object(value) || !eventKinds.includes(value.kind as PlannerScoreWorkflowEventKind)) return [issue("planner.score_workflow.event_invalid", "$", "Event kind is invalid.")];
  if (value.kind !== "reveal-aliases") {
    const leakPath = identityLeakPath(value);
    if (leakPath !== undefined) return [issue("planner.score_workflow.identity_leak", leakPath, "Identity-bearing fields are forbidden before alias reveal.")];
  }
  const common = ["eventDigest", "occurredAt", "previousEventDigest", "previousStateDigest", "privateMapDigest", "protocolDigest", "schemaVersion", "sequence", "signature", "studyId", "kind"];
  if (value.kind === "preregister-empty-blinded-sheet-lock") {
    if (!exactKeys(value, [...common, "blindedItems", "blindedSheetDigest"]) || !eventBaseShape(value) || !Array.isArray(value.blindedItems) || !value.blindedItems.every(blindedItemShape) || !digest(value.blindedSheetDigest)) return [issue("planner.score_workflow.event_invalid", "$", "Preregistration event schema is invalid.")];
    const ids = new Set<string>();
    if (value.blindedItems.length === 0 || !value.blindedItems.every((entry) => !ids.has(entry.reviewItemId) && Boolean(ids.add(entry.reviewItemId)))) return [issue("planner.score_workflow.event_invalid", "blindedItems", "Preregistration requires a non-empty set of unique review item identifiers.")];
    if (value.blindedSheetDigest !== planningDigest(value.blindedItems)) return [issue("planner.score_workflow.digest_mismatch", "blindedSheetDigest", "Blinded sheet digest must bind the canonical blinded items.")];
    return [];
  }
  if (value.kind === "complete-blinded-scoring") {
    if (!exactKeys(value, [...common, "scoredItems", "scoredSheetDigest"]) || !eventBaseShape(value) || !Array.isArray(value.scoredItems) || !value.scoredItems.every(scoredItemShape) || !digest(value.scoredSheetDigest)) return [issue("planner.score_workflow.event_invalid", "$", "Blinded scoring event schema is invalid.")];
    if (value.scoredSheetDigest !== planningDigest(value.scoredItems)) return [issue("planner.score_workflow.digest_mismatch", "scoredSheetDigest", "Scored sheet digest must bind the canonical scored items.")];
    return [];
  }
  if (value.kind === "lock-scored-sheet") {
    if (!exactKeys(value, [...common, "scoreLockReceipt"]) || !eventBaseShape(value) || !lockReceiptShape(value.scoreLockReceipt)) return [issue("planner.score_workflow.event_invalid", "$", "Scored lock event requires a prospective lock receipt.")];
    return [];
  }
  if (value.kind === "reveal-aliases") {
    if (!exactKeys(value, [...common, "lockDigest", "reveals"]) || !eventBaseShape(value) || !digest(value.lockDigest) || !Array.isArray(value.reveals) || !value.reveals.every(revealShape)) return [issue("planner.score_workflow.event_invalid", "$", "Reveal event schema is invalid.")];
    return [];
  }
  if (!exactKeys(value, [...common, "reportDigest"]) || !eventBaseShape(value) || !digest(value.reportDigest)) return [issue("planner.score_workflow.event_invalid", "$", "Report signing event schema is invalid.")];
  return [];
}

function phaseFor(kind: PlannerScoreWorkflowEventKind): PlannerScoreWorkflowPhase {
  return phases[eventKinds.indexOf(kind)];
}

function expectedKind(phase: PlannerScoreWorkflowPhase | undefined): PlannerScoreWorkflowEventKind {
  if (phase === undefined) return "preregister-empty-blinded-sheet-lock";
  return eventKinds[phases.indexOf(phase) + 1] as PlannerScoreWorkflowEventKind;
}

function buildState(events: readonly PlannerScoreWorkflowEvent[]): PlannerScoreWorkflowState {
  const preregistration = events[0] as PlannerScoreWorkflowPreregisterEvent;
  const last = events[events.length - 1];
  const scoring = events.find((event): event is PlannerScoreWorkflowScoringCompleteEvent => event.kind === "complete-blinded-scoring");
  const lock = events.find((event): event is PlannerScoreWorkflowScoredLockEvent => event.kind === "lock-scored-sheet");
  const reveal = events.find((event): event is PlannerScoreWorkflowAliasesRevealedEvent => event.kind === "reveal-aliases");
  const report = events.find((event): event is PlannerScoreWorkflowReportSignedEvent => event.kind === "sign-report");
  const state: Omit<PlannerScoreWorkflowState, "stateDigest"> = {
    schemaVersion,
    studyId: preregistration.studyId,
    protocolDigest: preregistration.protocolDigest,
    phase: phaseFor(last.kind),
    sequence: last.sequence,
    occurredAt: last.occurredAt,
    previousStateDigest: last.previousStateDigest,
    previousEventDigest: last.previousEventDigest,
    eventDigest: last.eventDigest,
    signature: last.signature,
    events,
    blindedItems: preregistration.blindedItems,
    blindedSheetDigest: preregistration.blindedSheetDigest,
    privateMapDigest: preregistration.privateMapDigest,
    ...(scoring ? { scoredItems: scoring.scoredItems, scoredSheetDigest: scoring.scoredSheetDigest } : {}),
    ...(lock ? { scoreLockReceipt: lock.scoreLockReceipt, lockDigest: lock.scoreLockReceipt.lockDigest } : {}),
    ...(reveal ? { reveals: reveal.reveals } : {}),
    ...(report ? { reportDigest: report.reportDigest } : {})
  };
  return { ...state, stateDigest: planningDigest(state) };
}

function validateTransition(previous: PlannerScoreWorkflowState | undefined, candidate: unknown): readonly PlannerScoreWorkflowIssue[] {
  const shapeIssues = validateEventShape(candidate);
  if (shapeIssues.length > 0) return shapeIssues;
  const event = candidate as PlannerScoreWorkflowEvent;
  const expected = expectedKind(previous?.phase);
  if (event.kind !== expected) return [issue("planner.score_workflow.transition_invalid", "kind", `Expected ${expected} after ${previous?.phase ?? "workflow start"}.`)];
  if (previous === undefined) {
    if (event.sequence !== 1 || event.previousStateDigest !== null || event.previousEventDigest !== null) return [issue("planner.score_workflow.transition_invalid", "$", "Preregistration must be the first event and cannot bind prior state or event digests.")];
    return [];
  }
  if (event.studyId !== previous.studyId || event.protocolDigest !== previous.protocolDigest || event.privateMapDigest !== previous.privateMapDigest || event.sequence !== previous.sequence + 1) return [issue("planner.score_workflow.transition_invalid", "$", "Event study, protocol, private-map identity, and sequence must continue the current workflow.")];
  if (event.previousStateDigest !== previous.stateDigest || event.previousEventDigest !== previous.eventDigest) return [issue("planner.score_workflow.digest_mismatch", "$", "Event must bind the immediately previous state and event digests.")];
  if (Date.parse(event.occurredAt) <= Date.parse(previous.occurredAt)) return [issue("planner.score_workflow.timestamp_rollback", "occurredAt", "Event timestamp must be strictly later than the prior event.")];
  if (event.kind === "complete-blinded-scoring") {
    const preregistration = previous.events[0] as PlannerScoreWorkflowPreregisterEvent;
    const expectedIds = new Set(preregistration.blindedItems.map((item) => item.reviewItemId));
    if (!sameIds(event.scoredItems, expectedIds) || !event.scoredItems.every((item) => preregistration.blindedItems.some((blinded) => blinded.reviewItemId === item.reviewItemId && blinded.blindedItemDigest === item.blindedItemDigest))) return [issue("planner.score_workflow.event_invalid", "scoredItems", "Scored items must contain exactly the preregistered review items and blinded digests.")];
  }
  if (event.kind === "lock-scored-sheet") {
    const scoring = previous.events.find((prior): prior is PlannerScoreWorkflowScoringCompleteEvent => prior.kind === "complete-blinded-scoring");
    if (!scoring || event.scoreLockReceipt.sequence !== event.sequence || event.scoreLockReceipt.occurredAt !== event.occurredAt || event.scoreLockReceipt.scoreSheetDigest !== scoring.scoredSheetDigest) return [issue("planner.score_workflow.transition_invalid", "scoreLockReceipt", "Scored lock receipt must prospectively bind this completed scored sheet.")];
    const expectedItems = new Set(scoring.scoredItems.map((item) => item.reviewItemId));
    if (!sameIds(event.scoreLockReceipt.lockedItems, expectedItems) || !event.scoreLockReceipt.lockedItems.every((locked) => scoring.scoredItems.some((scored) => scored.reviewItemId === locked.reviewItemId && scored.scoredItemDigest === locked.scoredItemDigest))) return [issue("planner.score_workflow.digest_mismatch", "scoreLockReceipt", "Lock receipt must canonically bind every scored item.")];
  }
  if (event.kind === "reveal-aliases") {
    const scoring = previous.events.find((prior): prior is PlannerScoreWorkflowScoringCompleteEvent => prior.kind === "complete-blinded-scoring");
    const lock = previous.events.find((prior): prior is PlannerScoreWorkflowScoredLockEvent => prior.kind === "lock-scored-sheet");
    if (!scoring || !lock || event.lockDigest !== lock.scoreLockReceipt.lockDigest) return [issue("planner.score_workflow.transition_invalid", "$", "Reveal requires the preregistered private map and prospective scored lock receipt.")];
    const expectedIds = new Set(scoring.scoredItems.map((item) => item.reviewItemId));
    if (!sameIds(event.reveals, expectedIds) || !event.reveals.every((reveal) => scoring.scoredItems.some((scored) => scored.reviewItemId === reveal.reviewItemId && scored.blindedItemDigest === reveal.blindedItemDigest && scored.scoredItemDigest === reveal.scoredItemDigest))) return [issue("planner.score_workflow.digest_mismatch", "reveals", "Reveals must bind every locked scored item without changing its score.")];
    const preregistration = previous.events[0] as PlannerScoreWorkflowPreregisterEvent;
    const openedPrivateMapDigest = plannerScoreWorkflowPrivateMapDigest(preregistration.blindedItems, event.reveals);
    if (openedPrivateMapDigest !== preregistration.privateMapDigest || openedPrivateMapDigest !== event.privateMapDigest) return [issue("planner.score_workflow.digest_mismatch", "privateMapDigest", "Reveals must exactly open the preregistered private alias, planner, and run map.")];
  }
  return [];
}

function validateState(value: unknown): readonly PlannerScoreWorkflowIssue[] {
  if (!object(value) || !Array.isArray(value.events) || value.events.length === 0 || !digest(value.stateDigest)) return [issue("planner.score_workflow.state_invalid", "$", "Workflow state must contain an event history and state digest.")];
  let prior: PlannerScoreWorkflowState | undefined;
  for (const [index, event] of value.events.entries()) {
    const transitionIssues = validateTransition(prior, event);
    if (transitionIssues.length > 0) return transitionIssues.map((entry) => ({ ...entry, path: `events[${index}]${entry.path === "$" ? "" : `.${entry.path}`}` }));
    prior = buildState([...(prior?.events ?? []), event as PlannerScoreWorkflowEvent]);
  }
  if (!prior || !exactKeys(value, Object.keys(prior)) || planningDigest(value) !== planningDigest(prior) || value.stateDigest !== prior.stateDigest) return [issue("planner.score_workflow.digest_mismatch", "stateDigest", "State must be the canonical snapshot of its validated event history.")];
  return [];
}

export function validatePlannerScoreWorkflow(value: unknown): PlannerScoreWorkflowValidationResult {
  try {
    const issues = validateState(value);
    return { valid: issues.length === 0, issues };
  } catch {
    return { valid: false, issues: [issue("planner.score_workflow.state_invalid", "$", "Workflow state is not safely readable.")] };
  }
}

export function transitionPlannerScoreWorkflow(
  previous: unknown,
  event: unknown
): PlannerScoreWorkflowTransitionResult {
  try {
    let current: PlannerScoreWorkflowState | undefined;
    if (previous !== undefined) {
      const previousValidation = validatePlannerScoreWorkflow(previous);
      if (!previousValidation.valid) return { valid: false, issues: previousValidation.issues };
      current = previous as PlannerScoreWorkflowState;
    }
    const issues = validateTransition(current, event);
    if (issues.length > 0) return { valid: false, issues };
    const state = buildState([...(current?.events ?? []), event as PlannerScoreWorkflowEvent]);
    return { valid: true, issues: [], state };
  } catch {
    return { valid: false, issues: [issue("planner.score_workflow.event_invalid", "$", "Event is not safely readable.")] };
  }
}
