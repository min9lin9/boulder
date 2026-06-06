import type { BoulderManifest } from "./types";
import { missingWorkflowStackComponents, workflowStackRolesMatch } from "./workflow-stack";

export type ScorecardStatus = "pass" | "partial" | "fail";

export type ScorecardCriterion = {
  readonly id: string;
  readonly label: string;
  readonly weight: number;
  readonly points: number;
  readonly status: ScorecardStatus;
  readonly evidence: string;
};

export type HarnessScorecard = {
  readonly score: number;
  readonly maxScore: number;
  readonly rating: "ready" | "usable" | "needs-work";
  readonly criteria: readonly ScorecardCriterion[];
};

export function scoreManifest(manifest: BoulderManifest): HarnessScorecard {
  const criteria = [
    contextContract(manifest),
    operatorWorkflowStack(manifest),
    verificationGates(manifest),
    providerPolicy(manifest),
    exportReadiness(manifest),
    reviewBoundaries(manifest)
  ];
  const maxScore = criteria.reduce((total, item) => total + item.weight, 0);
  const score = criteria.reduce((total, item) => total + item.points, 0);
  return {
    score,
    maxScore,
    rating: ratingForCriteria(score, maxScore, criteria),
    criteria
  };
}

export function scorecardToMarkdown(scorecard: HarnessScorecard): string {
  return [
    "# Harness Quality Scorecard",
    "",
    `Score: ${scorecard.score}/${scorecard.maxScore}`,
    `Rating: ${scorecard.rating}`,
    "",
    "## Criteria",
    "",
    ...scorecard.criteria.flatMap((item) => [
      `### ${item.id}`,
      "",
      `Status: ${item.status}`,
      `Points: ${item.points}/${item.weight}`,
      `Evidence: ${item.evidence}`,
      ""
    ])
  ].join("\n");
}

function contextContract(manifest: BoulderManifest): ScorecardCriterion {
  const hasContract = Boolean(
    manifest.name.trim() &&
    manifest.description.trim() &&
    manifest.maintainers.length &&
    manifest.workflows.length &&
    manifest.protectedPaths.length
  );
  return criterion({
    id: "context-contract",
    label: "Maintainer context contract",
    weight: 15,
    status: hasContract ? "pass" : "fail",
    evidence: hasContract ? "name, description, maintainers, workflows, and protected paths are present" : "required context fields are missing"
  });
}

function operatorWorkflowStack(manifest: BoulderManifest): ScorecardCriterion {
  const missing = missingWorkflowStackComponents(manifest.workflowStack);
  const rolesMatch = workflowStackRolesMatch(manifest.workflowStack);
  if (!missing.length && rolesMatch) {
    return criterion({
      id: "operator-workflow-stack",
      label: "Operator workflow stack",
      weight: 20,
      status: "pass",
      evidence: "Superpowers workflow spine, GStack review gates, and Compound learning layer are required"
    });
  }
  if (!missing.length) {
    return criterion({
      id: "operator-workflow-stack",
      label: "Operator workflow stack",
      weight: 20,
      status: "partial",
      evidence: "required components exist, but har-maker roles do not fully match"
    });
  }
  return criterion({
    id: "operator-workflow-stack",
    label: "Operator workflow stack",
    weight: 20,
    status: "fail",
    evidence: `missing required component(s): ${missing.join(", ")}`
  });
}

function verificationGates(manifest: BoulderManifest): ScorecardCriterion {
  const required = manifest.verification.filter((item) => item.required && item.command.trim());
  if (required.length) {
    return criterion({
      id: "verification-gates",
      label: "Required verification gates",
      weight: 20,
      status: "pass",
      evidence: `${required.length} required verification command(s) configured`
    });
  }
  if (manifest.verification.length) {
    return criterion({
      id: "verification-gates",
      label: "Required verification gates",
      weight: 20,
      status: "partial",
      evidence: "verification commands exist, but none are marked required"
    });
  }
  return criterion({
    id: "verification-gates",
    label: "Required verification gates",
    weight: 20,
    status: "fail",
    evidence: "no verification commands are configured"
  });
}

function providerPolicy(manifest: BoulderManifest): ScorecardCriterion {
  const safePolicy = !manifest.providers.externalAllowed || manifest.providers.approvalRequired;
  return criterion({
    id: "provider-policy",
    label: "Provider approval policy",
    weight: 20,
    status: safePolicy ? "pass" : "fail",
    evidence: safePolicy ? "external providers are disabled or approval-gated" : "external providers are enabled without approval gating"
  });
}

function exportReadiness(manifest: BoulderManifest): ScorecardCriterion {
  if (manifest.export.markdown && manifest.export.codexNotes) {
    return criterion({
      id: "export-readiness",
      label: "Export readiness",
      weight: 10,
      status: "pass",
      evidence: "Markdown export and Codex notes are enabled"
    });
  }
  if (manifest.export.markdown || manifest.export.codexNotes) {
    return criterion({
      id: "export-readiness",
      label: "Export readiness",
      weight: 10,
      status: "partial",
      evidence: "one export channel is enabled"
    });
  }
  return criterion({
    id: "export-readiness",
    label: "Export readiness",
    weight: 10,
    status: "fail",
    evidence: "no export channel is enabled"
  });
}

function reviewBoundaries(manifest: BoulderManifest): ScorecardCriterion {
  const hasReviewWorkflow = manifest.workflows.includes("pr-review-prep");
  const hasProtectedBoundaries = manifest.protectedPaths.length >= 3;
  if (hasReviewWorkflow && hasProtectedBoundaries) {
    return criterion({
      id: "review-boundaries",
      label: "Review boundaries",
      weight: 15,
      status: "pass",
      evidence: "PR review workflow and protected path boundaries are configured"
    });
  }
  if (hasReviewWorkflow || manifest.protectedPaths.length) {
    return criterion({
      id: "review-boundaries",
      label: "Review boundaries",
      weight: 15,
      status: "partial",
      evidence: "some review workflow or protected path boundary is configured"
    });
  }
  return criterion({
    id: "review-boundaries",
    label: "Review boundaries",
    weight: 15,
    status: "fail",
    evidence: "review workflow and protected path boundaries are missing"
  });
}

function criterion(input: Omit<ScorecardCriterion, "points">): ScorecardCriterion {
  return {
    ...input,
    points: pointsForStatus(input.weight, input.status)
  };
}

function pointsForStatus(weight: number, status: ScorecardStatus): number {
  if (status === "pass") return weight;
  if (status === "partial") return Math.floor(weight / 2);
  return 0;
}

function ratingForCriteria(score: number, maxScore: number, criteria: readonly ScorecardCriterion[]): HarnessScorecard["rating"] {
  if (criteria.some((item) => item.id === "provider-policy" && item.status === "fail")) {
    return "needs-work";
  }
  const percentage = Math.round((score / maxScore) * 100);
  if (percentage >= 85) return "ready";
  if (percentage >= 70) return "usable";
  return "needs-work";
}
