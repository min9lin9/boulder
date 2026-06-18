import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, test } from "bun:test";
import { recordFieldEvidence } from "../src/field-evidence";
import { evaluateServiceReadiness } from "../src/service-readiness";

async function tempRepo(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "boulder-service-readiness-"));
}

async function write(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

async function writeServiceFixture(root: string): Promise<void> {
  await write(root, "docs/SERVICE_LOOP.md", "install\ninit\ninspect\npipeline\nhandoff\nverify\nexport\nreadiness\nreplay\nsupport\nnot hosted\nprovider launch\n");
  await write(root, "docs/ONBOARDING.md", "Published Package Path\nLocal Checkout Path\nbun bin/boulder.ts --help\ninit\ninspect\npipeline\nexport\nproduct-readiness\nquickstart\nonboard\ndoctor\nservice-readiness\nconfigured-unverified\ndoes not mutate\n");
  await write(root, "docs/EXTERNAL_REPLAY.md", "official-docs.json\nreplay.json\nofficial docs\n");
  await write(root, "docs/HANDOFF_VALIDATION.md", "officialDocsSources\nacceptanceCriteria\nmanualQaPlan\nlazycodexResult\n");
  await write(root, "docs/OPERATING_METRICS.md", "Activation\nOnboarding\nReplay\nHandoff\nofficial-docs-coverage\nReadiness pass rate\nSupport intake\nnumerator\ndenominator\nsource\n");
  await write(root, "docs/TRUST_SUPPORT_SECURITY.md", "Support channels\nSecurity policy\nResponsible disclosure\nNo credential access\nRollback\n");
  await write(root, "fixtures/service-readiness/gates.json", JSON.stringify({
    activationGate: {
      status: "pass",
      timeToFirstReadinessDeltaMinutes: 12,
      evidencePath: ".omo/ulw-loop/evidence/service-gap-remediation/activation.txt"
    },
    repeatRunGate: {
      status: "pass",
      changedRecommendations: ["tighten public artifact share-safety"],
      evidencePath: ".omo/ulw-loop/evidence/service-gap-remediation/repeat-run.txt"
    },
    shareSafeGate: {
      status: "pass",
      checkedArtifactPaths: ["docs/SERVICE_STRATEGY_REVIEW.md"],
      blockedPatterns: ["local paths", "secrets", "private repo assumptions", "unsupported claims"],
      evidencePath: ".omo/ulw-loop/evidence/service-gap-remediation/share-safe.txt"
    },
    decisionImpactGate: {
      status: "pass",
      outcomes: ["request-changes"],
      evidencePath: ".omo/ulw-loop/evidence/service-gap-remediation/decision-impact.txt"
    },
    externalReplayGate: {
      status: "pass",
      officialDocsFirst: true,
      publicTarget: "min9lin9/kimi-agent-swarm-skill",
      evidencePath: ".omo/ulw-loop/evidence/service-gap-remediation/external-replay.txt"
    },
    metricsGate: {
      status: "pass",
      generatedFromEvidence: true,
      metrics: ["time-to-first-readiness-delta", "readiness delta count", "public evidence link count"],
      evidencePath: ".omo/ulw-loop/evidence/service-gap-remediation/metrics.txt"
    }
  }));
  await write(root, ".github/ISSUE_TEMPLATE/bug_report.yml", "name: Bug\nDo not paste secrets\n");
  await write(root, ".github/ISSUE_TEMPLATE/feature_request.yml", "name: Feature\n");
  await write(root, ".github/ISSUE_TEMPLATE/ai_contribution.yml", "name: AI\n");
  await write(root, ".github/ISSUE_TEMPLATE/documentation.yml", "name: Docs\n");
  await write(root, "fixtures/replay/kimi-agent-swarm-skill/official-docs.json", JSON.stringify({
    project: "kimi-agent-swarm-skill",
    repoUrl: "https://github.com/min9lin9/kimi-agent-swarm-skill",
    docsUrls: ["https://github.com/min9lin9/kimi-agent-swarm-skill#readme"],
    versionOrRef: "main",
    setupCommands: ["bun install"],
    testCommands: ["bun test"],
    contributionPolicy: "Use repository README and issues.",
    securityPolicy: "Do not include secrets.",
    constraints: ["No credentials"],
    retrievedAt: "2026-06-12"
  }));
  await write(root, "fixtures/replay/kimi-agent-swarm-skill/replay.json", JSON.stringify({
    project: "kimi-agent-swarm-skill",
    repoUrl: "https://github.com/min9lin9/kimi-agent-swarm-skill",
    ref: "main",
    officialDocsPath: "fixtures/replay/kimi-agent-swarm-skill/official-docs.json",
    commands: ["bun bin/boulder.ts inspect --cwd . --json"],
    expectedArtifacts: ["docs/REPO_BRIEF.md"],
    evidencePaths: ["docs/CASE_STUDIES/evidence/external-replay/kimi-agent-swarm-skill.txt"],
    limitations: ["Public replay requires network checkout."]
  }));
  for (const friction of ["low", "medium", "high"]) {
    await write(root, `fixtures/handoffs/${friction}.json`, JSON.stringify({
      friction,
      officialDocsSources: ["fixtures/replay/kimi-agent-swarm-skill/official-docs.json"],
      gjcPlan: { objective: "Plan bounded work", acceptanceCriteria: ["criteria exists"], manualQaPlan: ["tmux command"], riskRegister: [] },
      lazycodexResult: { changedFiles: [], verificationCommands: ["bun test"], readyForReview: true },
      acceptanceCriteria: ["criteria exists"]
    }));
  }
  await writeFieldEvidence(root);
  await recordFieldEvidence(root, "oss-run-1", "evidence/field-readiness/oss-run-1");
}

async function writeFieldEvidence(root: string, runId = "oss-run-1"): Promise<void> {
  const base = `evidence/field-readiness/${runId}`;
  await write(root, `${base}/activation-transcript.txt`, "boulder inspect\nboulder service-readiness\n");
  await write(root, `${base}/first-readiness.json`, "{\"status\":\"pilot-ready\"}\n");
  await write(root, `${base}/second-readiness-delta.json`, "{\"changedRecommendations\":[\"add public evidence link\"]}\n");
  await write(root, `${base}/share-safe-artifact-url.txt`, "https://github.com/min9lin9/boulder/pull/1\n");
  await write(root, `${base}/decision-log.json`, "{\"outcome\":\"request-changes\"}\n");
  await write(root, `${base}/official-docs-refresh.json`, "{\"officialDocsFirst\":true,\"docsUrls\":[\"https://github.com/min9lin9/boulder#readme\"]}\n");
  await write(root, `${base}/generated-metrics.json`, "{\"generatedFromEvidence\":true,\"metrics\":[\"time-to-first-readiness-delta\",\"readiness delta count\",\"public evidence link count\"]}\n");
}

describe("service readiness", () => {
  test("rates a service evidence fixture as pilot-ready when product readiness is still blocked", async () => {
    const root = await tempRepo();
    await writeServiceFixture(root);

    const readiness = await evaluateServiceReadiness(root);

    expect(readiness.status).toBe("pilot-ready");
    expect(readiness.checks.some((item) => item.id === "official-docs-coverage" && item.status === "pass")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "service-acceptance-gates" && item.status === "pass")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "field-evidence" && item.status === "pass")).toBe(true);
    expect(readiness.checks.some((item) => item.id === "product-readiness" && item.status === "fail")).toBe(true);
  });

  test("blocks when repeat-run gate evidence is missing", async () => {
    const root = await tempRepo();
    await writeServiceFixture(root);
    await write(root, "fixtures/service-readiness/gates.json", JSON.stringify({
      activationGate: {
        status: "pass",
        timeToFirstReadinessDeltaMinutes: 12,
        evidencePath: ".omo/ulw-loop/evidence/service-gap-remediation/activation.txt"
      }
    }));

    const readiness = await evaluateServiceReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "service-acceptance-gates" && item.status === "fail" && item.evidence.includes("repeat-run-gate"))).toBe(true);
  });

  test("blocks when official documentation evidence is missing for public OSS replay", async () => {
    const root = await tempRepo();
    await writeServiceFixture(root);
    await write(root, "fixtures/replay/kimi-agent-swarm-skill/official-docs.json", "{}\n");

    const readiness = await evaluateServiceReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "official-docs-coverage" && item.status === "fail")).toBe(true);
  });

  test("blocks when field evidence is not complete", async () => {
    const root = await tempRepo();
    await writeServiceFixture(root);
    await write(root, "evidence/field-readiness/oss-run-1/decision-log.json", "{\"outcome\":\"unsupported\"}\n");

    const readiness = await evaluateServiceReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "field-evidence" && item.status === "fail")).toBe(true);
  });

  test("blocks when the recorded field evidence manifest is stale or failing", async () => {
    const root = await tempRepo();
    await writeServiceFixture(root);
    await write(root, "evidence/field-readiness/oss-run-1/manifest.json", "{\"status\":\"fail\"}\n");

    const readiness = await evaluateServiceReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "field-evidence" && item.status === "fail" && item.evidence.includes("manifest"))).toBe(true);
  });

  test("blocks when field evidence exists but no manifest was recorded", async () => {
    const root = await tempRepo();
    await writeServiceFixture(root);
    await rm(join(root, "evidence/field-readiness/oss-run-1/manifest.json"));

    const readiness = await evaluateServiceReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "field-evidence" && item.status === "fail" && item.evidence.includes("manifest missing"))).toBe(true);
  });

  test("blocks when any recorded field evidence run becomes invalid", async () => {
    const root = await tempRepo();
    await writeServiceFixture(root);
    await writeFieldEvidence(root, "oss-run-2");
    await recordFieldEvidence(root, "oss-run-2", "evidence/field-readiness/oss-run-2");
    await write(root, "evidence/field-readiness/oss-run-2/decision-log.json", "{\"outcome\":\"unsupported\"}\n");

    const readiness = await evaluateServiceReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "field-evidence" && item.status === "fail" && item.evidence.includes("oss-run-2"))).toBe(true);
  });

  test("blocks when onboarding uses stale pre-publish terms", async () => {
    const root = await tempRepo();
    await writeServiceFixture(root);
    await write(root, "docs/ONBOARDING.md", "bun bin/boulder.ts --help\ninit\ninspect\npipeline\nexport\nproduct-readiness\npre-publish\npost-publish\n");

    const readiness = await evaluateServiceReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "onboarding" && item.status === "fail" && item.evidence.includes("Published Package Path"))).toBe(true);
  });

  test("blocks when onboarding mixes current and stale publish terms", async () => {
    const root = await tempRepo();
    await writeServiceFixture(root);
    await write(root, "docs/ONBOARDING.md", "Published Package Path\nLocal Checkout Path\nbun bin/boulder.ts --help\ninit\ninspect\npipeline\nexport\nproduct-readiness\nquickstart\nonboard\ndoctor\nservice-readiness\nconfigured-unverified\ndoes not mutate\npre-publish\n");

    const readiness = await evaluateServiceReadiness(root);

    expect(readiness.status).toBe("blocked");
    expect(readiness.checks.some((item) => item.id === "onboarding" && item.status === "fail" && item.evidence.includes("forbidden terms"))).toBe(true);
  });
});
