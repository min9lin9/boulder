import { expect, test } from "bun:test";
import { createCriticReviewAttestation, validateCriticReview, validateReviewJoin, validateReviewerAuthorities, type CriticReview, type CriticReviewerAuthority } from "../src/critic-review";

const digest = `sha256:${"a".repeat(64)}`;
const authority = (reviewType: CriticReview["reviewType"]): CriticReviewerAuthority => ({
  reviewType,
  adapter: "independent-critic",
  host: "local",
  toolVersion: "1.0.0",
  issuer: `trusted-${reviewType}`,
  keyId: `${reviewType}-key-1`,
  secret: `${reviewType}-review-secret`
});

const review = (reviewType: CriticReview["reviewType"]): CriticReview => {
  const base: Omit<CriticReview, "attestation"> = {
    schemaVersion: "boulder.critic-review.v1",
    reviewType,
    packetDigest: digest,
    verdict: "PASS",
    findings: [],
    coverage: ["schema", "scope", "traceability"],
    reviewer: { adapter: "independent-critic", host: "local", toolVersion: "1.0.0", independentFromProducer: true },
    createdAt: "2026-07-15T12:00:00Z"
  };
  return { ...base, attestation: createCriticReviewAttestation(base, authority(reviewType)) };
};

const authorities = (): readonly CriticReviewerAuthority[] => [authority("structural"), authority("semantic")];

test("validates cryptographically attested critic reviews", () => {
  expect(validateCriticReview(review("structural"))).toEqual({ valid: true, issues: [] });
});

test("rejects forged attestation metadata and review content tampering", () => {
  const original = review("structural");
  expect(validateReviewerAuthorities([{ ...original, reviewer: { ...original.reviewer, adapter: "forged" } }, review("semantic")], authorities()).map((item) => item.id)).toContain("plan.review.authority");
  expect(validateReviewerAuthorities([{ ...original, attestation: { ...original.attestation, issuer: "forged" } }, review("semantic")], authorities()).map((item) => item.id)).toContain("plan.review.authority");
  expect(validateReviewerAuthorities([original, { ...review("semantic"), attestation: { ...review("semantic").attestation, signature: "0".repeat(64) } }], authorities()).map((item) => item.id)).toContain("plan.review.authority");
});

test("rejects wrong configured key and stale packet attestations", () => {
  const structural = review("structural");
  const semantic = review("semantic");
  expect(validateReviewerAuthorities([structural, semantic], [{ ...authority("structural"), secret: "wrong-key" }, authority("semantic")]).map((item) => item.id)).toContain("plan.review.authority");
  const stale = { ...semantic, packetDigest: `sha256:${"b".repeat(64)}` };
  expect(validateReviewJoin({ packetDigest: digest, reviews: [structural, stale], unresolvedFindings: [], iteration: 0, sourceDrift: false }).map((item) => item.id)).toContain("plan.review.stale");
});

test("derives blocking findings from trusted joined artifacts", () => {
  const structural = { ...review("structural"), findings: [{ id: "F1", severity: "critical" as const, category: "safety", statement: "unsafe", evidenceRefs: ["S1"], requiredChange: "fix" }] };
  const resigned = { ...structural, attestation: createCriticReviewAttestation(structural, authority("structural")) };
  const issues = validateReviewJoin({ packetDigest: digest, reviews: [resigned, review("semantic")], unresolvedFindings: [], iteration: 0, sourceDrift: false });
  expect(issues.map((item) => item.id)).toContain("plan.review.required");
});

test("requires exact configured authorities and preserves revision cap", () => {
  expect(validateReviewerAuthorities([review("structural"), review("semantic")], [authority("structural")]).map((item) => item.id)).toEqual(["plan.review.authority"]);
  expect(validateReviewJoin({ packetDigest: digest, reviews: [review("structural"), review("semantic")], unresolvedFindings: [], iteration: 4, sourceDrift: false }).map((item) => item.id)).toContain("plan.review.iteration_limit");
});
