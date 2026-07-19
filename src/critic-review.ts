import { canonicalizePlanningValue, sha256Digest } from "./planning-canonical.js";
export type PlanningValidationIssue = {
  readonly id: string;
  readonly path: string;
  readonly message: string;
};

export type CriticReviewType = "structural" | "semantic";
export type CriticVerdict = "PASS" | "ITERATE" | "REJECT";
export type CriticFindingSeverity = "low" | "medium" | "high" | "critical";

export type CriticFinding = {
  readonly id: string;
  readonly severity: CriticFindingSeverity;
  readonly category: string;
  readonly statement: string;
  readonly evidenceRefs: readonly string[];
  readonly requiredChange: string;
};

export type CriticReviewer = {
  readonly adapter: string;
  readonly host: string;
  readonly toolVersion: string;
  readonly independentFromProducer: boolean;
};
export type CriticReviewAttestation = {
  readonly schemaVersion: "boulder.critic-attestation.v1";
  readonly issuer: string;
  readonly keyId: string;
  readonly reviewDigest: string;
  readonly signature: string;
};


export type CriticReview = {
  readonly schemaVersion: "boulder.critic-review.v1";
  readonly reviewType: CriticReviewType;
  readonly packetDigest: string;
  readonly verdict: CriticVerdict;
  readonly findings: readonly CriticFinding[];
  readonly coverage: readonly string[];
  readonly reviewer: CriticReviewer;
  readonly createdAt: string;
  readonly attestation: CriticReviewAttestation;
};

export type CriticReviewValidation = {
  readonly valid: boolean;
  readonly issues: readonly PlanningValidationIssue[];
};

export type ReviewJoinInput = {
  readonly packetDigest: string;
  readonly reviews: readonly CriticReview[];
  readonly unresolvedFindings: readonly CriticFinding[];
  readonly iteration: number;
  readonly sourceDrift: boolean;
};
export type CriticReviewerAuthority = {
  readonly reviewType: CriticReviewType;
  readonly adapter: string;
  readonly host: string;
  readonly toolVersion: string;
  readonly issuer: string;
  readonly keyId: string;
  readonly secret: string;
};

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const REVIEW_TYPES: readonly CriticReviewType[] = ["structural", "semantic"];
const VERDICTS: readonly CriticVerdict[] = ["PASS", "ITERATE", "REJECT"];
const SEVERITIES: readonly CriticFindingSeverity[] = ["low", "medium", "high", "critical"];
const COVERAGE_IDS = new Set([
  "schema", "identity", "scope", "graph", "traceability", "verification-trust",
  "risk", "approval", "source-grounding", "external-boundary"
]);

export function validateCriticReview(value: unknown): CriticReviewValidation {
  const issues: PlanningValidationIssue[] = [];
  if (!isRecord(value)) return invalid("plan.packet.invalid", "$", "Critic review must be an object.");
  field(value, "schemaVersion", (item) => item === "boulder.critic-review.v1", issues, "plan.schema.unsupported");
  field(value, "reviewType", (item) => isMember(item, REVIEW_TYPES), issues, "plan.packet.invalid");
  field(value, "packetDigest", isDigest, issues, "plan.packet.invalid");
  field(value, "verdict", (item) => isMember(item, VERDICTS), issues, "plan.packet.invalid");
  validateFindings(value.findings, issues);
  if (!isStringArray(value.coverage) || value.coverage.some((item) => !COVERAGE_IDS.has(item))) {
    issues.push(issue("plan.packet.invalid", "coverage", "Coverage must contain only structural check identifiers."));
  }
  if (!isRecord(value.reviewer)
    || !nonEmpty(value.reviewer.adapter)
    || !nonEmpty(value.reviewer.host)
    || !nonEmpty(value.reviewer.toolVersion)
    || typeof value.reviewer.independentFromProducer !== "boolean") {
    issues.push(issue("plan.packet.invalid", "reviewer", "Reviewer metadata is invalid."));
  }
  field(value, "createdAt", isUtcIso, issues, "plan.packet.invalid");
  if (value.attestation !== undefined) validateAttestation(value, issues);
  return { valid: issues.length === 0, issues };
}

export function validateReviewJoin(input: ReviewJoinInput): readonly PlanningValidationIssue[] {
  const issues: PlanningValidationIssue[] = [];
  input.reviews.forEach((review, index) => {
    for (const reviewIssue of validateCriticReview(review).issues) {
      issues.push({ ...reviewIssue, path: `reviews[${index}].${reviewIssue.path}` });
    }
  });

  const structural = input.reviews.filter((review) => isRecord(review) && review.reviewType === "structural");
  const semantic = input.reviews.filter((review) => isRecord(review) && review.reviewType === "semantic");
  const joinedFindings = [...(structural[0]?.findings ?? []), ...(semantic[0]?.findings ?? [])];
  if (structural.length !== 1 || semantic.length !== 1
    || structural[0]?.verdict !== "PASS" || semantic[0]?.verdict !== "PASS") {
    issues.push(issue("plan.review.required", "reviews", "One trusted PASS structural review and one trusted PASS semantic review are required."));
  }
  if (input.reviews.some((review) => !isRecord(review) || review.packetDigest !== input.packetDigest)) {
    issues.push(issue("plan.review.stale", "reviews.packetDigest", "Reviews must bind the current planning packet digest."));
  }
  if ([...joinedFindings, ...input.unresolvedFindings].some(isBlockingFinding)) {
    issues.push(issue("plan.review.required", "unresolvedFindings", "No unresolved high or critical findings are allowed."));
  }
  if (!Number.isInteger(input.iteration) || input.iteration < 0 || input.iteration > 3) {
    issues.push(issue("plan.review.iteration_limit", "iteration", "Review iteration must be between zero and three."));
  }
  if (input.sourceDrift) issues.push(issue("plan.review.stale", "sourceDrift", "Source drift requires both reviews to be rerun."));
  return issues;
}
export function validateReviewerAuthorities(reviews: readonly CriticReview[], authorities: readonly CriticReviewerAuthority[]): readonly PlanningValidationIssue[] {
  const issues: PlanningValidationIssue[] = [];
  for (const reviewType of REVIEW_TYPES) {
    const matches = authorities.filter((authority) => authority.reviewType === reviewType);
    const review = reviews.find((candidate) => isRecord(candidate) && candidate.reviewType === reviewType);
    if (matches.length !== 1 || !review || !authorityAuthenticatesReview(review, matches[0])) {
      issues.push(issue("plan.review.authority", `reviews.${reviewType}.attestation`, "Review must carry an attestation from the exact configured reviewer authority."));
    }
  }
  return issues;
}

export function createCriticReviewAttestation(
  review: Omit<CriticReview, "attestation">,
  authority: CriticReviewerAuthority
): CriticReviewAttestation {
  const reviewDigest = criticReviewDigest(review);
  return {
    schemaVersion: "boulder.critic-attestation.v1",
    issuer: authority.issuer,
    keyId: authority.keyId,
    reviewDigest,
    signature: hmacHex(authority.secret, attestationPayload(review, authority.issuer, authority.keyId, reviewDigest))
  };
}
function validateAttestation(value: Record<string, unknown>, issues: PlanningValidationIssue[]): void {
  if (!isRecord(value.attestation)
    || value.attestation.schemaVersion !== "boulder.critic-attestation.v1"
    || !nonEmpty(value.attestation.issuer)
    || !nonEmpty(value.attestation.keyId)
    || !isDigest(value.attestation.reviewDigest)
    || !isHex(value.attestation.signature)
    || value.attestation.reviewDigest !== criticReviewDigest(value)) {
    issues.push(issue("plan.packet.invalid", "attestation", "Review attestation must bind the canonical review content."));
  }
}

function authorityAuthenticatesReview(review: CriticReview, authority: CriticReviewerAuthority): boolean {
  const attestation = review.attestation;
  return nonEmpty(authority.adapter)
    && nonEmpty(authority.host)
    && nonEmpty(authority.toolVersion)
    && nonEmpty(authority.issuer)
    && nonEmpty(authority.keyId)
    && nonEmpty(authority.secret)
    && review.reviewer.adapter === authority.adapter
    && review.reviewer.host === authority.host
    && review.reviewer.toolVersion === authority.toolVersion
    && attestation?.schemaVersion === "boulder.critic-attestation.v1"
    && attestation.issuer === authority.issuer
    && attestation.keyId === authority.keyId
    && attestation.reviewDigest === criticReviewDigest(review)
    && constantTimeEqual(attestation.signature, hmacHex(
      authority.secret,
      attestationPayload(review, attestation.issuer, attestation.keyId, attestation.reviewDigest)
    ));
}

function criticReviewDigest(review: Omit<CriticReview, "attestation"> | Record<string, unknown>): string {
  const content: Record<string, unknown> = { ...review };
  delete content.attestation;
  return sha256Digest(canonicalizePlanningValue(content));
}

function attestationPayload(review: Omit<CriticReview, "attestation"> | CriticReview, issuer: string, keyId: string, reviewDigest: string): string {
  return canonicalizePlanningValue({
    domain: "boulder.critic-attestation.v1",
    reviewType: review.reviewType,
    reviewer: review.reviewer,
    packetDigest: review.packetDigest,
    issuer,
    keyId,
    reviewDigest
  });
}

function hmacHex(secret: string, payload: string): string {
  type HmacHasher = { update(input: string): HmacHasher; digest(encoding: "hex"): string };
  const CryptoHasher = (Bun as typeof Bun & { readonly CryptoHasher: new (algorithm: "sha256", key?: string) => HmacHasher }).CryptoHasher;
  return new CryptoHasher("sha256", secret).update(payload).digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function isBlockingFinding(finding: CriticFinding): boolean {
  return finding.severity === "high" || finding.severity === "critical";
}

function validateFindings(value: unknown, issues: PlanningValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(issue("plan.packet.invalid", "findings", "Findings must be an array."));
    return;
  }
  value.forEach((item, index) => {
    const path = `findings[${index}]`;
    if (!isRecord(item) || !nonEmpty(item.id) || !isMember(item.severity, SEVERITIES)
      || !nonEmpty(item.category) || !nonEmpty(item.statement) || !isStringArray(item.evidenceRefs)
      || !nonEmpty(item.requiredChange)) {
      issues.push(issue("plan.packet.invalid", path, "Finding shape is invalid."));
    }
  });
}

function field(record: Record<string, unknown>, key: string, predicate: (value: unknown) => boolean, issues: PlanningValidationIssue[], id: string): void {
  if (!predicate(record[key])) issues.push(issue(id, key, `Invalid ${key}.`));
}

function invalid(id: string, path: string, message: string): CriticReviewValidation {
  return { valid: false, issues: [issue(id, path, message)] };
}

function issue(id: string, path: string, message: string): PlanningValidationIssue {
  return { id, path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isHex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isMember<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST.test(value);
}

function isUtcIso(value: unknown): value is string {
  return typeof value === "string" && /Z$/.test(value) && !Number.isNaN(Date.parse(value));
}
