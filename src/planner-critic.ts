import {
  validateReviewJoin,
  validateReviewerAuthorities,
  type CriticFinding,
  type CriticReview,
  type CriticReviewerAuthority,
  type PlanningValidationIssue
} from "./critic-review.js";
import { validatePlanningPacket, type PlanningPacket } from "./planning-packet.js";

export type PlannerCriticJoinInput = {
  readonly packet: PlanningPacket;
  readonly reviews: readonly CriticReview[];
  readonly reviewerAuthorities: readonly CriticReviewerAuthority[];
  readonly unresolvedFindings: readonly CriticFinding[];
  readonly iteration: number;
  readonly sourceDrift: boolean;
};

export type PlannerCriticJoinStatus = "PASS" | "ITERATE" | "REJECT";

export type PlannerCriticJoinResult = {
  readonly status: PlannerCriticJoinStatus;
  readonly packetDigest: string;
  readonly reviews: readonly {
    readonly reviewType: CriticReview["reviewType"];
    readonly packetDigest: string;
    readonly verdict: CriticReview["verdict"];
  }[];
  readonly issues: readonly PlanningValidationIssue[];
};

/**
 * Joins independent critic receipts against an immutable, canonically validated
 * planning packet. It intentionally returns receipt metadata only, never a
 * packet reference that a critic could modify.
 */
export function joinPlannerCriticReviews(input: PlannerCriticJoinInput): PlannerCriticJoinResult {
  const packetValidation = validatePlanningPacket(input.packet);
  const packetDigest = input.packet.packetDigest;
  const issues: PlanningValidationIssue[] = [...packetValidation.issues];

  if (packetValidation.valid) {
    issues.push(...validateReviewJoin({
      packetDigest,
      reviews: input.reviews,
      unresolvedFindings: input.unresolvedFindings,
      iteration: input.iteration,
      sourceDrift: input.sourceDrift
    }));
    issues.push(...validateReviewerAuthorities(input.reviews, input.reviewerAuthorities));
  }

  return {
    status: joinStatus(issues, input.reviews),
    packetDigest,
    reviews: input.reviews.map((review) => ({
      reviewType: review.reviewType,
      packetDigest: review.packetDigest,
      verdict: review.verdict
    })),
    issues
  };
}

function joinStatus(issues: readonly PlanningValidationIssue[], reviews: readonly CriticReview[]): PlannerCriticJoinStatus {
  if (issues.length === 0) return "PASS";
  if (issues.some((entry) => entry.id === "plan.review.iteration_limit")
    || reviews.some((review) => review.verdict === "REJECT")) return "REJECT";
  return "ITERATE";
}
