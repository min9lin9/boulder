import { describe, expect, test } from "bun:test";
import { canonicalizePlanningValue, sha256Digest, type PlanningSourceRef } from "../src/planning-canonical.js";
import { normalizePlannerOutput, plannerNormalizationArtifactDigest, type PlannerId } from "../src/planner-output-normalizer.js";

function output(plannerId: PlannerId): Record<string, unknown> {
  return {
    schemaVersion: "boulder.planner-output.v1",
    plannerId,
    planMarkdown: "# Plan\n\nImplement the normalizer.",
    objective: "Normalize a planner output into a validated packet.",
    decisions: [{ id: "D1", statement: "Use the current packet schema.", source: "inferred", sourceRefs: ["S1"], confidence: "high" }],
    scope: { allowedPaths: ["src/planner-output-normalizer.ts", "test/planner-output-normalizer.test.ts"], forbiddenPaths: [], protectedPaths: [], nonGoals: ["Network calls"] },
    tasks: [{ id: "T1", title: "Normalize output", dependsOn: [], paths: ["src/planner-output-normalizer.ts"], steps: ["Parse strict JSON."], acceptanceIds: ["AC1"], verificationIds: ["V1"], evidenceIds: ["E1"] }],
    acceptanceCriteria: [{ id: "AC1", statement: "Valid output creates a current packet.", verificationIds: ["V1"], evidenceIds: ["E1"] }],
    verification: [{ id: "V1", kind: "inspection", source: "planner-proposed", required: true, evidencePath: "evidence/normalizer.txt" }],
    risks: [{ id: "R1", severity: "medium", trigger: "Invalid planner output.", mitigation: "Reject it.", rollback: "Do not create a packet.", approvalGate: "plan" }],
    approvalPolicy: { plan: "required", execution: "required", external: "required-if-used" },
    review: { structural: "pending", semantic: "pending", unresolvedFindings: [] },
    sourceRefs: [{ id: "S1", path: "src/planning-packet.ts", sha256: `sha256:${"a".repeat(64)}`, kind: "code", trust: "untrusted-external" }],
  };
}

function context(
  plannerId: PlannerId,
  raw: string,
  digest = sha256Digest(raw),
  trustedSourceRefs: readonly PlanningSourceRef[] = [{
    id: "S1",
    path: "src/planning-packet.ts",
    sha256: `sha256:${"a".repeat(64)}`,
    kind: "code",
    trust: "repo-evidence",
  }],
) {
  return {
    plannerId,
    runId: "planner-run-1",
    createdAt: "2026-07-16T12:00:00Z",
    producer: { adapter: plannerId, mode: "focused" as const, host: "local", toolVersion: "1.0.0" },
    task: { rawTaskHash: `sha256:${"b".repeat(64)}`, normalizedSummary: "Normalize planner output", profileId: "benchmark", analysisRef: "analysis.json" },
    rawOutputDigest: digest,
    trustedSourceRefs,
  };
}

function issueIds(result: ReturnType<typeof normalizePlannerOutput>): readonly string[] {
  return result.issues.map((entry) => entry.id);
}

describe("normalizePlannerOutput", () => {
  test("normalizes every supported planner into a current packet", () => {
    const results = (["gjc", "boulder-native", "lazycodex"] as const).map((plannerId) => {
      const raw = JSON.stringify(output(plannerId));
      return normalizePlannerOutput(raw, context(plannerId, raw));
    });

    for (const result of results) {
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.packet.schemaVersion).toBe("boulder.planning-packet.v1");
        expect(result.packet.objective).toBe("Normalize a planner output into a validated packet.");
        expect(result.planMarkdown).toContain("# Plan");
      }
    }
  });

  test("returns byte-deterministic canonical packets for identical input and context", () => {
    const raw = JSON.stringify(output("gjc"));
    const first = normalizePlannerOutput(raw, context("gjc", raw));
    const second = normalizePlannerOutput(raw, context("gjc", raw));
    expect(first.valid).toBe(true);
    expect(second.valid).toBe(true);
    if (first.valid && second.valid) {
      expect(first.canonicalPacket).toBe(second.canonicalPacket);
      expect(first.canonicalPacket).toBe(canonicalizePlanningValue(first.packet));
      expect(first.packet.packetDigest).toBe(second.packet.packetDigest);
      expect(first.artifact.artifactDigest).toBe(second.artifact.artifactDigest);
    }
  });

  test("rejects malformed JSON and unknown, obsolete, and missing fields", () => {
    const malformed = normalizePlannerOutput("```json\n{}\n```", context("gjc", "```json\n{}\n```"));
    expect(issueIds(malformed)).toContain("plan.normalizer.json_invalid");

    const unknown = output("gjc"); unknown.extra = true;
    const unknownRaw = JSON.stringify(unknown);
    expect(issueIds(normalizePlannerOutput(unknownRaw, context("gjc", unknownRaw)))).toContain("plan.normalizer.field_unknown");

    const obsolete = output("gjc"); delete obsolete.schemaVersion; obsolete.packetId = "old"; obsolete.status = "complete"; obsolete.planner = "gjc";
    const obsoleteRaw = JSON.stringify(obsolete);
    const obsoleteResult = normalizePlannerOutput(obsoleteRaw, context("gjc", obsoleteRaw));
    expect(issueIds(obsoleteResult)).toContain("plan.normalizer.field_unknown");
    expect(issueIds(obsoleteResult)).toContain("plan.normalizer.field_missing");
  });

  test("rejects stale planner identity, invalid packet semantics, and unbound raw evidence", () => {
    const raw = JSON.stringify(output("gjc"));
    const staleContext = context("gjc", raw);
    const mismatchedProducer = { ...staleContext, producer: { ...staleContext.producer, adapter: "lazycodex" } };
    expect(issueIds(normalizePlannerOutput(raw, mismatchedProducer))).toContain("plan.normalizer.planner_mismatch");
    expect(issueIds(normalizePlannerOutput(raw, context("boulder-native", raw)))).toContain("plan.normalizer.planner_mismatch");

    const invalid = output("gjc") as { scope: { protectedPaths: string[]; allowedPaths: string[] } } & Record<string, unknown>;
    invalid.scope.protectedPaths = ["src/**"];
    const invalidRaw = JSON.stringify(invalid);
    expect(issueIds(normalizePlannerOutput(invalidRaw, context("gjc", invalidRaw)))).toContain("plan.scope.protected_conflict");

    const digestMismatch = normalizePlannerOutput(raw, context("gjc", raw, `sha256:${"0".repeat(64)}`));
    expect(issueIds(digestMismatch)).toContain("plan.normalizer.raw_digest_mismatch");
    expect(digestMismatch.rawOutputDigest).toBe(sha256Digest(raw));
  });
  test("rejects prototype names and literal optional marker keys at every schema depth", () => {
    const raw = JSON.stringify(output("gjc"));
    for (const attack of [
      raw.replace("{", "{\"__proto__\":{},"),
      raw.replace("{", "{\"constructor\":{},"),
      raw.replace("{", "{\"toString\":{},"),
      raw.replace("\"scope\":{", "\"scope\":{\"__proto__\":{},"),
      raw.replace("\"verification\":[{", "\"verification\":[{\"?command\":\"hidden\","),
      raw.replace("\"sourceRefs\":[{", "\"sourceRefs\":[{\"?symbol\":\"hidden\","),
    ]) {
      expect(issueIds(normalizePlannerOutput(attack, context("gjc", attack)))).toContain("plan.normalizer.field_unknown");
    }
  });

  test("rejects duplicate JSON names before parsing at top-level and nested depths, including escaped keys", () => {
    const raw = JSON.stringify(output("gjc"));
    const nested = raw.replace("\"allowedPaths\":[", "\"allowedPaths\":[],\"allowedPaths\":[");
    const escapedDuplicate = raw.replace("\"planMarkdown\":", "\"plan\\u004darkdown\":\"first\",\"planMarkdown\":");
    for (const attack of [
      raw.replace("\"plannerId\":\"gjc\"", "\"plannerId\":\"gjc\",\"plannerId\":\"gjc\""),
      nested,
      escapedDuplicate,
    ]) {
      const result = normalizePlannerOutput(attack, context("gjc", attack));
      expect(issueIds(result)).toContain("plan.normalizer.duplicate_key");
      expect(issueIds(result)).not.toContain("plan.normalizer.json_invalid");
    }
  });

  test("returns a self-digested artifact bound to exact raw text, markdown, and trusted replay context", () => {
    const raw = JSON.stringify(output("gjc"));
    const result = normalizePlannerOutput(raw, context("gjc", raw));
    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.artifact.rawOutput).toBe(raw);
    expect(result.artifact.planMarkdown).toBe(output("gjc").planMarkdown);
    expect(result.artifact.packet).toEqual(result.packet);
    expect(result.artifact.packetDigest).toBe(result.packet.packetDigest);
    const { artifactDigest, ...withoutDigest } = result.artifact;
    expect(artifactDigest).toBe(plannerNormalizationArtifactDigest(withoutDigest));

    const alteredRaw = raw.replace("normalizer.", "normalizer!");
    const altered = normalizePlannerOutput(alteredRaw, context("gjc", alteredRaw));
    expect(altered.valid).toBe(true);
    if (altered.valid) {
      expect(altered.artifact.rawOutputDigest).not.toBe(result.artifact.rawOutputDigest);
      expect(altered.artifact.artifactDigest).not.toBe(result.artifact.artifactDigest);
      expect(altered.packet.packetDigest).toBe(result.packet.packetDigest);
    }

    const replayContext = { ...context("gjc", raw), runId: "planner-run-2" };
    const replay = normalizePlannerOutput(raw, replayContext);
    expect(replay.valid).toBe(true);
    if (replay.valid) {
      expect(replay.artifact.context.runId).toBe("planner-run-2");
      expect(replay.artifact.artifactDigest).not.toBe(result.artifact.artifactDigest);
    }
  });
  test("promotes exact trusted evidence for security-grounded decisions", () => {
    const securityGrounded = output("gjc");
    (securityGrounded.decisions as Record<string, unknown>[])[0]!.statement = "Security requires rejecting untrusted planner output.";
    const raw = JSON.stringify(securityGrounded);
    const result = normalizePlannerOutput(raw, context("gjc", raw));

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.packet.sourceRefs[0]!.trust).toBe("repo-evidence");
      expect(result.packet.packetDigest).not.toBe("");
    }
  });

  test("rejects unknown and digest-mismatched planner source references", () => {
    const unknown = output("gjc");
    (unknown.sourceRefs as Record<string, unknown>[])[0]!.id = "S2";
    const unknownRaw = JSON.stringify(unknown);
    expect(issueIds(normalizePlannerOutput(unknownRaw, context("gjc", unknownRaw)))).toContain("plan.normalizer.source_ref_unknown");

    const mismatched = output("gjc");
    (mismatched.sourceRefs as Record<string, unknown>[])[0]!.sha256 = `sha256:${"c".repeat(64)}`;
    const mismatchedRaw = JSON.stringify(mismatched);
    expect(issueIds(normalizePlannerOutput(mismatchedRaw, context("gjc", mismatchedRaw)))).toContain("plan.normalizer.source_ref_mismatch");
  });

  test("rejects omitted trusted location metadata and security decisions without evidence", () => {
    const raw = JSON.stringify(output("gjc"));
    const locationCatalog = context("gjc", raw, sha256Digest(raw), [{
      id: "S1",
      path: "src/planning-packet.ts",
      sha256: `sha256:${"a".repeat(64)}`,
      kind: "code",
      trust: "repo-evidence",
      symbol: "validatePlanningPacket",
    }]);
    expect(issueIds(normalizePlannerOutput(raw, locationCatalog))).toContain("plan.normalizer.source_ref_mismatch");

    const noEvidence = output("gjc");
    (noEvidence.decisions as Record<string, unknown>[])[0]!.statement = "Security requires trusted evidence.";
    (noEvidence.decisions as Record<string, unknown>[])[0]!.sourceRefs = [];
    noEvidence.sourceRefs = [];
    const noEvidenceRaw = JSON.stringify(noEvidence);
    expect(issueIds(normalizePlannerOutput(noEvidenceRaw, context("gjc", noEvidenceRaw, sha256Digest(noEvidenceRaw), [])))).toContain("plan.decision.untrusted_basis");
  });

  test("rejects planner trust labels and duplicate catalog or source identities", () => {
    const trustedLabel = output("gjc");
    (trustedLabel.sourceRefs as Record<string, unknown>[])[0]!.trust = "repo-evidence";
    const trustedLabelRaw = JSON.stringify(trustedLabel);
    expect(issueIds(normalizePlannerOutput(trustedLabelRaw, context("gjc", trustedLabelRaw)))).toContain("plan.normalizer.trust_claim");

    const raw = JSON.stringify(output("gjc"));
    const duplicateCatalog = context("gjc", raw, sha256Digest(raw), [
      {
        id: "S1",
        path: "src/planning-packet.ts",
        sha256: `sha256:${"a".repeat(64)}`,
        kind: "code",
        trust: "repo-evidence",
      },
      {
        id: "S1",
        path: "src/planning-packet.ts",
        sha256: `sha256:${"a".repeat(64)}`,
        kind: "code",
        trust: "operator-contract",
      },
    ]);
    expect(issueIds(normalizePlannerOutput(raw, duplicateCatalog))).toContain("plan.normalizer.source_catalog_duplicate");

    const duplicateRef = output("gjc");
    duplicateRef.sourceRefs = [...(duplicateRef.sourceRefs as Record<string, unknown>[]), { ...(duplicateRef.sourceRefs as Record<string, unknown>[])[0]! }];
    const duplicateRefRaw = JSON.stringify(duplicateRef);
    expect(issueIds(normalizePlannerOutput(duplicateRefRaw, context("gjc", duplicateRefRaw)))).toContain("plan.normalizer.source_ref_duplicate");
  });

  test("rejects invalid catalog trust and keeps tuple identities collision-free", () => {
    const raw = JSON.stringify(output("gjc"));
    const invalidTrust = context("gjc", raw, sha256Digest(raw), [{
      id: "S1",
      path: "src/planning-packet.ts",
      sha256: `sha256:${"a".repeat(64)}`,
      kind: "code",
      trust: "untrusted-external",
    }]);
    expect(issueIds(normalizePlannerOutput(raw, invalidTrust))).toContain("plan.normalizer.source_catalog_invalid");

    const collision = output("gjc");
    (collision.sourceRefs as Record<string, unknown>[])[0]!.id = "S1\u0000src";
    (collision.sourceRefs as Record<string, unknown>[])[0]!.path = "planning-packet.ts";
    const collisionRaw = JSON.stringify(collision);
    const collisionCatalog = context("gjc", collisionRaw, sha256Digest(collisionRaw), [{
      id: "S1",
      path: "src\u0000planning-packet.ts",
      sha256: `sha256:${"a".repeat(64)}`,
      kind: "code",
      trust: "repo-evidence",
    }]);
    expect(issueIds(normalizePlannerOutput(collisionRaw, collisionCatalog))).toContain("plan.normalizer.source_ref_unknown");
  });

  test("binds artifact and packet digests to the trusted source catalog", () => {
    const raw = JSON.stringify(output("gjc"));
    const first = normalizePlannerOutput(raw, context("gjc", raw));
    const second = normalizePlannerOutput(raw, context("gjc", raw, sha256Digest(raw), [{
      id: "S1",
      path: "src/planning-packet.ts",
      sha256: `sha256:${"a".repeat(64)}`,
      kind: "code",
      trust: "operator-contract",
    }]));

    expect(first.valid).toBe(true);
    expect(second.valid).toBe(true);
    if (first.valid && second.valid) {
      expect(first.packet.packetDigest).not.toBe(second.packet.packetDigest);
      expect(first.artifact.artifactDigest).not.toBe(second.artifact.artifactDigest);
    }
  });

  test("rejects malformed, empty, and duplicate risk ids through the normalizer", () => {
    for (const id of [null, "", { value: "R1" }]) {
      const invalid = output("gjc");
      (invalid.risks as Record<string, unknown>[])[0]!.id = id;
      const raw = JSON.stringify(invalid);
      expect(issueIds(normalizePlannerOutput(raw, context("gjc", raw)))).toContain("plan.packet.invalid");
    }
    const duplicate = output("gjc");
    duplicate.risks = [...(duplicate.risks as Record<string, unknown>[]), { ...(duplicate.risks as Record<string, unknown>[])[0]! }];
    const raw = JSON.stringify(duplicate);
    expect(issueIds(normalizePlannerOutput(raw, context("gjc", raw)))).toContain("plan.reference.missing");
  });
  test("rejects unauthenticated trust claims and disconnected scored plans", () => {
    const trustedClaim = output("gjc");
    (trustedClaim.decisions as Record<string, unknown>[])[0]!.source = "maintainer";
    (trustedClaim.verification as Record<string, unknown>[])[0]!.source = "user-approved";
    (trustedClaim.review as Record<string, unknown>).structural = "pass";
    (trustedClaim.sourceRefs as Record<string, unknown>[])[0]!.trust = "repo-evidence";
    const trustedRaw = JSON.stringify(trustedClaim);
    const trustedResult = normalizePlannerOutput(trustedRaw, context("gjc", trustedRaw));
    expect(issueIds(trustedResult)).toContain("plan.normalizer.trust_claim");

    const disconnected = output("gjc");
    disconnected.tasks = [];
    disconnected.acceptanceCriteria = [];
    disconnected.verification = [];
    const disconnectedRaw = JSON.stringify(disconnected);
    const disconnectedResult = normalizePlannerOutput(disconnectedRaw, context("gjc", disconnectedRaw));
    expect(issueIds(disconnectedResult)).toContain("plan.normalizer.plan_empty");
  });
  test("rejects cross-wired and orphan acceptance graphs", () => {
    const crossWired = output("gjc");
    (crossWired.tasks as Record<string, unknown>[])[0]!.verificationIds = ["V2"];
    const crossWiredRaw = JSON.stringify(crossWired);
    expect(issueIds(normalizePlannerOutput(crossWiredRaw, context("gjc", crossWiredRaw)))).toContain("plan.normalizer.graph_disconnected");

    const orphan = output("gjc");
    orphan.acceptanceCriteria = [
      ...(orphan.acceptanceCriteria as Record<string, unknown>[]),
      { id: "AC2", statement: "Orphan criterion.", verificationIds: ["V1"], evidenceIds: ["E1"] }
    ];
    const orphanRaw = JSON.stringify(orphan);
    expect(issueIds(normalizePlannerOutput(orphanRaw, context("gjc", orphanRaw)))).toContain("plan.normalizer.graph_disconnected");
  });
});
