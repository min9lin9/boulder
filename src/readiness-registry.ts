export type ReadinessReportId = "release-check" | "product-readiness" | "service-readiness";

export type ReadinessSeverity = "blocker";

export type ReadinessRegistryEntry = {
  readonly id: string;
  readonly category: string;
  readonly severity: ReadinessSeverity;
  readonly validator: {
    readonly kind: "content" | "aggregate" | "git" | "manifest" | "filesystem";
    readonly hook: string;
  };
  readonly evidence: {
    readonly kind: "file" | "files" | "command" | "aggregate";
    readonly paths: readonly string[];
  };
  readonly recoveryHintId: string;
  readonly formatter: {
    readonly report: ReadinessReportId;
    readonly order: number;
    readonly markdownSection: "Checks";
  };
};

type ReadinessCheck = {
  readonly id: string;
};

export class ReadinessRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadinessRegistryError";
  }
}

export const READINESS_REGISTRY = buildReadinessRegistry([
  releaseEntry("package-metadata", "metadata", 5, "manifest", "packageMetadataCheck", "file", ["package.json"], "package.metadata_missing"),
  releaseContent("release-workflow-doc", 10, "release.workflow_doc", "docs/RELEASE_WORKFLOW.md"),
  releaseContent("ci-bun-engine", 20, "release.ci_bun_engine", ".github/workflows/ci.yml"),
  releaseContent("changelog-version", 30, "release.changelog_version", "CHANGELOG.md"),
  releaseContent("install-smoke-evidence", 40, "release.install_smoke", "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"),
  releaseContent("install-smoke-version", 50, "release.install_smoke_version", "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"),
  releaseContent("published-version-evidence", 60, "release.published_version", "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"),
  releaseContent("github-actions-evidence", 70, "release.github_actions", "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt"),
  releaseEntry("git-tag-local", "scm", 80, "git", "localTagCheck", "command", [], "release.git_tag_local"),
  releaseEntry("release-evidence-manifest", "manifest", 90, "manifest", "releaseManifestCheck", "file", ["docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json"], "release.evidence_manifest"),
  releaseContent("pack-dry-run-evidence", 100, "release.pack_dry_run", "docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt"),

  productEntry("clean-release-tree", "source-tree", 10, "filesystem", "cleanReleaseTreeCheck", [], "product.clean_release_tree"),
  productContent("codex-oss-application-packet", "docs", 20, "product.application_packet", "docs/CODEX_OSS_APPLICATION_PACKET.md"),
  productContent("public-case-study-index", "case-study", 30, "product.case_study_index", "docs/CASE_STUDIES/README.md"),
  productEntry("public-case-studies", "case-study", 40, "filesystem", "allFilesCheck", ["docs/CASE_STUDIES/pr-review.md", "docs/CASE_STUDIES/release-workflow.md", "docs/CASE_STUDIES/core-implementation.md"], "product.case_studies"),
  productContent("gjc-plan-evidence", "evidence", 50, "product.gjc_plan_evidence", "docs/CASE_STUDIES/evidence/core-implementation/gjc-plan.md"),
  productContent("lazycodex-implementation-evidence", "evidence", 60, "product.lazycodex_implementation_evidence", "docs/CASE_STUDIES/evidence/core-implementation/lazycodex-implementation-summary.md"),
  productEntry("boulder-verify-evidence", "evidence", 70, "filesystem", "allFilesCheck", ["docs/CASE_STUDIES/evidence/pr-review/BOULDER_EXPORT.md", "docs/CASE_STUDIES/evidence/core-implementation/BOULDER_EXPORT.md", "docs/CASE_STUDIES/evidence/release-workflow/ci.txt"], "product.boulder_verify_evidence"),
  productContent("public-ci-workflow", "automation", 80, "product.public_ci_workflow", ".github/workflows/ci.yml"),
  productContent("public-ci-run-evidence", "automation", 90, "product.public_ci_run_evidence", "docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt"),
  productContent("published-install-smoke", "release", 100, "product.published_install_smoke", "docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"),
  productEntry("public-release-check", "release", 110, "aggregate", "publicReleaseCheck", [], "product.public_release_check"),
  productContent("limitations-explicit", "docs", 120, "product.limitations_explicit", "docs/CODEX_OSS_APPLICATION_PACKET.md"),
  productContent("trust-support-security-posture", "support", 130, "product.trust_support_security", "docs/TRUST_SUPPORT_SECURITY.md"),
  productEntry("public-support-templates", "support", 140, "filesystem", "allFilesCheck", [".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml", ".github/ISSUE_TEMPLATE/ai_contribution.yml", ".github/ISSUE_TEMPLATE/documentation.yml", "SECURITY.md"], "product.public_support_templates"),
  productEntry("gjc-lazycodex-handoff-fixtures", "fixtures", 150, "filesystem", "allFilesCheck", ["fixtures/handoffs/low.json", "fixtures/handoffs/medium.json", "fixtures/handoffs/high.json"], "product.handoff_fixtures"),
  productContent("final-audit", "audit", 160, "product.final_audit", "docs/CODEX_OSS_FINAL_AUDIT.md"),

  serviceContent("service-loop", "docs", 10, "service.service_loop", "docs/SERVICE_LOOP.md"),
  serviceContent("onboarding", "docs", 20, "service.onboarding", "docs/ONBOARDING.md"),
  serviceEntry("official-docs-coverage", "replay", 30, "aggregate", "officialDocsCoverageCheck", ["fixtures/replay/*/official-docs.json"], "service.official_docs_coverage"),
  serviceEntry("external-replay", "replay", 40, "aggregate", "replayManifestCheck", ["fixtures/replay/*/replay.json"], "service.external_replay"),
  serviceEntry("handoff-validation", "handoff", 50, "aggregate", "handoffFixturesCheck", ["fixtures/handoffs/low.json", "fixtures/handoffs/medium.json", "fixtures/handoffs/high.json"], "service.handoff_validation"),
  serviceEntry("service-acceptance-gates", "gates", 60, "aggregate", "evaluateServiceGates", ["fixtures/service-readiness/gates.json"], "service.acceptance_gates"),
  serviceEntry("field-evidence", "evidence", 70, "aggregate", "fieldEvidenceCheck", ["evidence/field-readiness/<run-id>"], "service.field_evidence"),
  serviceContent("operating-metrics", "metrics", 80, "service.operating_metrics", "docs/OPERATING_METRICS.md"),
  serviceEntry("support-routes", "support", 90, "filesystem", "supportRoutesCheck", [".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml", ".github/ISSUE_TEMPLATE/ai_contribution.yml", ".github/ISSUE_TEMPLATE/documentation.yml", "docs/TRUST_SUPPORT_SECURITY.md"], "service.support_routes"),
  serviceEntry("product-readiness", "product", 100, "aggregate", "evaluateProductReadiness", [], "service.product_readiness")
]);

export function buildReadinessRegistry(entries: readonly ReadinessRegistryEntry[]): readonly ReadinessRegistryEntry[] {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new ReadinessRegistryError(`Duplicate readiness check id: ${entry.id}`);
    }
    ids.add(entry.id);
  }
  return entries.slice().sort(compareRegistryEntries);
}

export function readinessEntriesForReport(report: ReadinessReportId): readonly ReadinessRegistryEntry[] {
  return READINESS_REGISTRY.filter((entry) => entry.formatter.report === report);
}

export function orderReadinessChecks<T extends ReadinessCheck>(report: ReadinessReportId, checks: readonly T[]): readonly T[] {
  const byId = new Map(checks.map((check) => [check.id, check]));
  if (byId.size !== checks.length) {
    throw new ReadinessRegistryError(`Duplicate evaluated readiness check id for ${report}`);
  }

  const ordered = [];
  for (const entry of readinessEntriesForReport(report)) {
    const check = byId.get(entry.id);
    if (!check) {
      throw new ReadinessRegistryError(`Missing evaluated readiness check id for ${report}: ${entry.id}`);
    }
    ordered.push(check);
  }

  if (ordered.length !== checks.length) {
    const registered = new Set(readinessEntriesForReport(report).map((entry) => entry.id));
    const extra = checks.filter((check) => !registered.has(check.id)).map((check) => check.id);
    throw new ReadinessRegistryError(`Unregistered evaluated readiness check id for ${report}: ${extra.join(", ")}`);
  }

  return ordered;
}

function compareRegistryEntries(left: ReadinessRegistryEntry, right: ReadinessRegistryEntry): number {
  if (left.formatter.report !== right.formatter.report) {
    return left.formatter.report.localeCompare(right.formatter.report);
  }
  if (left.formatter.order !== right.formatter.order) {
    return left.formatter.order - right.formatter.order;
  }
  return left.id.localeCompare(right.id);
}

function releaseContent(id: string, order: number, recoveryHintId: string, path: string): ReadinessRegistryEntry {
  return releaseEntry(id, "evidence", order, "content", "contentCheck", "file", [path], recoveryHintId);
}

function productContent(id: string, category: string, order: number, recoveryHintId: string, path: string): ReadinessRegistryEntry {
  return productEntry(id, category, order, "content", "contentCheck", [path], recoveryHintId);
}

function serviceContent(id: string, category: string, order: number, recoveryHintId: string, path: string): ReadinessRegistryEntry {
  return serviceEntry(id, category, order, "content", "contentCheck", [path], recoveryHintId);
}

function releaseEntry(
  id: string,
  category: string,
  order: number,
  validatorKind: ReadinessRegistryEntry["validator"]["kind"],
  hook: string,
  evidenceKind: ReadinessRegistryEntry["evidence"]["kind"],
  paths: readonly string[],
  recoveryHintId: string
): ReadinessRegistryEntry {
  return entry("release-check", id, category, order, validatorKind, hook, evidenceKind, paths, recoveryHintId);
}

function productEntry(
  id: string,
  category: string,
  order: number,
  validatorKind: ReadinessRegistryEntry["validator"]["kind"],
  hook: string,
  paths: readonly string[],
  recoveryHintId: string
): ReadinessRegistryEntry {
  return entry("product-readiness", id, category, order, validatorKind, hook, paths.length > 1 ? "files" : "file", paths, recoveryHintId);
}

function serviceEntry(
  id: string,
  category: string,
  order: number,
  validatorKind: ReadinessRegistryEntry["validator"]["kind"],
  hook: string,
  paths: readonly string[],
  recoveryHintId: string
): ReadinessRegistryEntry {
  return entry("service-readiness", id, category, order, validatorKind, hook, paths.length > 1 ? "files" : "file", paths, recoveryHintId);
}

function entry(
  report: ReadinessReportId,
  id: string,
  category: string,
  order: number,
  validatorKind: ReadinessRegistryEntry["validator"]["kind"],
  hook: string,
  evidenceKind: ReadinessRegistryEntry["evidence"]["kind"],
  paths: readonly string[],
  recoveryHintId: string
): ReadinessRegistryEntry {
  return {
    id,
    category,
    severity: "blocker",
    validator: { kind: validatorKind, hook },
    evidence: { kind: evidenceKind, paths },
    recoveryHintId,
    formatter: { report, order, markdownSection: "Checks" }
  };
}
