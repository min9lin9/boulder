export type ControlRunStatus = "completed" | "failed" | "blocked";
export type ControlToolCallStatus = "completed" | "failed" | "blocked";
export type EvidenceClassification = "public" | "internal" | "confidential" | "restricted";
export type EvidenceSourceType = "document" | "database" | "api" | "human" | "derived";
export type HardFailureSeverity = "critical" | "major";
export type MetricOperator = "gte" | "lte" | "eq";

export type ControlModelRef = {
  readonly provider: string;
  readonly name: string;
  readonly version: string;
};

export type ControlToolCall = {
  readonly toolId: string;
  readonly toolVersion: string;
  readonly action: string;
  readonly status: ControlToolCallStatus;
  readonly inputHash: string;
  readonly outputHash: string | null;
};

export type ControlRunEvent = {
  readonly schemaVersion: "boulder.control.run-event.v1";
  readonly runId: string;
  readonly caseId: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly agentVersion: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly parentRunId: string | null;
  readonly idempotencyKey: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly evidenceCutoffAt: string;
  readonly evidenceManifestHash: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly policyHash: string;
  readonly promptVersion: string;
  readonly model: ControlModelRef;
  readonly toolCalls: readonly ControlToolCall[];
  readonly artifactHashes: readonly string[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly hardFailureSignals: readonly string[];
  readonly status: ControlRunStatus;
};

export type ControlEvidenceEntry = {
  readonly evidenceId: string;
  readonly sha256: string;
  readonly sourceType: EvidenceSourceType;
  readonly classification: EvidenceClassification;
  readonly sourceVersion: string;
  readonly observedAt: string;
  readonly sourceUriHash: string | null;
};

export type ControlEvidenceManifest = {
  readonly schemaVersion: "boulder.control.evidence-manifest.v1";
  readonly manifestId: string;
  readonly caseId: string;
  readonly evidenceCutoffAt: string;
  readonly generatedAt: string;
  readonly entries: readonly ControlEvidenceEntry[];
};

export type HardFailureRule = {
  readonly id: string;
  readonly signal: string;
  readonly severity: HardFailureSeverity;
  readonly description: string;
};

export type MetricRule = {
  readonly metricId: string;
  readonly operator: MetricOperator;
  readonly threshold: number;
  readonly description: string;
};

export type ControlPolicy = {
  readonly schemaVersion: "boulder.control.policy.v1";
  readonly id: string;
  readonly version: string;
  readonly blockingSeverities: readonly HardFailureSeverity[];
  readonly hardFailures: readonly HardFailureRule[];
  readonly metricRules: readonly MetricRule[];
};

export type TriggeredHardFailure = HardFailureRule & { readonly blocked: boolean };
export type MetricCheck = MetricRule & { readonly actual: number | null; readonly status: "pass" | "fail" };

export type ControlEvaluation = {
  readonly schemaVersion: "boulder.control.evaluation.v1";
  readonly runId: string;
  readonly caseId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly status: "eligible" | "blocked";
  readonly evidenceManifestHash: string;
  readonly policyHash: string;
  readonly triggeredHardFailures: readonly TriggeredHardFailure[];
  readonly metricChecks: readonly MetricCheck[];
  readonly issues: readonly string[];
};

export type ControlDecisionSeal = {
  readonly schemaVersion: "boulder.control.decision-seal.v1";
  readonly algorithm: "sha256-canonical-json";
  readonly runId: string;
  readonly caseId: string;
  readonly taskId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly sealedAt: string;
  readonly runHash: string;
  readonly evidenceManifestHash: string;
  readonly policyHash: string;
  readonly sealHash: string;
};

export type SealVerification = { readonly status: "valid" | "invalid"; readonly issues: readonly string[] };
