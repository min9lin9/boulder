import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./fs";

export type BenchmarkFixture = {
  readonly id: string;
  readonly name: string;
  readonly repositoryShape: string;
  readonly description: string;
  readonly expectedOutputs: readonly string[];
  readonly expectedVerification: readonly string[];
  readonly requiredBoundaries: readonly string[];
  readonly disallowedClaims: readonly string[];
};

export type BenchmarkCriterion = {
  readonly id: string;
  readonly weight: number;
  readonly points: number;
  readonly status: "pass" | "fail";
  readonly evidence: string;
};

export type BenchmarkResult = {
  readonly fixtureId: string;
  readonly name: string;
  readonly repositoryShape: string;
  readonly score: number;
  readonly maxScore: number;
  readonly rating: "ready" | "needs-work";
  readonly criteria: readonly BenchmarkCriterion[];
};

export type BenchmarkReport = {
  readonly fixtureCount: number;
  readonly readyCount: number;
  readonly results: readonly BenchmarkResult[];
};

export class BenchmarkFixtureError extends Error {
  readonly source: string;

  constructor(source: string, message: string) {
    super(`${source}: ${message}`);
    this.name = "BenchmarkFixtureError";
    this.source = source;
  }
}

export async function loadBenchmarkFixtures(root: string): Promise<BenchmarkFixture[]> {
  const dir = join(root, "fixtures", "benchmarks");
  if (!await exists(dir)) return [];
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json")).sort();
  const fixtures: BenchmarkFixture[] = [];
  for (const file of files) {
    const path = join(dir, file);
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    fixtures.push(parseBenchmarkFixture(parsed, path));
  }
  return fixtures;
}

export function evaluateBenchmarkFixtures(fixtures: readonly BenchmarkFixture[]): BenchmarkReport {
  const results = fixtures.map(evaluateFixture);
  return {
    fixtureCount: fixtures.length,
    readyCount: results.filter((item) => item.rating === "ready").length,
    results
  };
}

export function benchmarkReportToMarkdown(report: BenchmarkReport): string {
  return [
    "# Benchmark Fixture Report",
    "",
    "This is not a runtime speed benchmark, model benchmark, or leaderboard claim.",
    "It checks whether Boulder benchmark fixtures define repeatable harness expectations and explicit claim boundaries.",
    "",
    `Fixtures: ${report.fixtureCount}`,
    `Ready: ${report.readyCount}/${report.fixtureCount}`,
    "",
    "## Results",
    "",
    ...report.results.flatMap((result) => [
      `### ${result.fixtureId}`,
      "",
      `Name: ${result.name}`,
      `Repository shape: ${result.repositoryShape}`,
      `Score: ${result.score}/${result.maxScore}`,
      `Rating: ${result.rating}`,
      "",
      ...result.criteria.flatMap((criterion) => [
        `- ${criterion.id}: ${criterion.status} (${criterion.points}/${criterion.weight}) - ${criterion.evidence}`
      ]),
      ""
    ]),
    "## Disallowed Claims",
    "",
    "- benchmark-leadership",
    "- runtime-speed",
    "- model-quality-comparison",
    ""
  ].join("\n");
}

function evaluateFixture(fixture: BenchmarkFixture): BenchmarkResult {
  const criteria = [
    outputContract(fixture),
    verificationContract(fixture),
    boundaryContract(fixture),
    claimDiscipline(fixture)
  ];
  const maxScore = criteria.reduce((total, item) => total + item.weight, 0);
  const score = criteria.reduce((total, item) => total + item.points, 0);
  return {
    fixtureId: fixture.id,
    name: fixture.name,
    repositoryShape: fixture.repositoryShape,
    score,
    maxScore,
    rating: score >= 85 ? "ready" : "needs-work",
    criteria
  };
}

function outputContract(fixture: BenchmarkFixture): BenchmarkCriterion {
  const required = ["BOULDER.md", "boulder.yaml", "docs/REPO_BRIEF.md", "docs/CODEX_WORKFLOW_NOTES.md"] as const;
  const missing = required.filter((item) => !fixture.expectedOutputs.includes(item));
  return criterion({
    id: "output-contract",
    weight: 25,
    status: missing.length ? "fail" : "pass",
    evidence: missing.length ? `missing expected outputs: ${missing.join(", ")}` : "core Boulder outputs are specified"
  });
}

function verificationContract(fixture: BenchmarkFixture): BenchmarkCriterion {
  return criterion({
    id: "verification-contract",
    weight: 25,
    status: fixture.expectedVerification.length ? "pass" : "fail",
    evidence: fixture.expectedVerification.length ? `${fixture.expectedVerification.length} verification expectation(s) specified` : "no verification expectations specified"
  });
}

function boundaryContract(fixture: BenchmarkFixture): BenchmarkCriterion {
  const required = ["provider-approval", "local-verification", "secret-exclusion"] as const;
  const missing = required.filter((item) => !fixture.requiredBoundaries.includes(item));
  return criterion({
    id: "boundary-contract",
    weight: 25,
    status: missing.length ? "fail" : "pass",
    evidence: missing.length ? `missing boundaries: ${missing.join(", ")}` : "provider, local verification, and secret boundaries are specified"
  });
}

function claimDiscipline(fixture: BenchmarkFixture): BenchmarkCriterion {
  const required = ["benchmark-leadership", "runtime-speed", "model-quality-comparison"] as const;
  const missing = required.filter((item) => !fixture.disallowedClaims.includes(item));
  return criterion({
    id: "claim-discipline",
    weight: 25,
    status: missing.length ? "fail" : "pass",
    evidence: missing.length ? `missing disallowed claims: ${missing.join(", ")}` : "leaderboard, speed, and model-quality claims are disallowed"
  });
}

function criterion(input: Omit<BenchmarkCriterion, "points">): BenchmarkCriterion {
  return {
    ...input,
    points: input.status === "pass" ? input.weight : 0
  };
}

function parseBenchmarkFixture(value: unknown, source: string): BenchmarkFixture {
  if (!isRecord(value)) {
    throw new BenchmarkFixtureError(source, "fixture must be an object");
  }
  const id = stringField(value, source, "id");
  return {
    id,
    name: stringField(value, source, "name"),
    repositoryShape: stringField(value, source, "repositoryShape"),
    description: stringField(value, source, "description"),
    expectedOutputs: stringArrayField(value, source, "expectedOutputs"),
    expectedVerification: stringArrayField(value, source, "expectedVerification"),
    requiredBoundaries: stringArrayField(value, source, "requiredBoundaries"),
    disallowedClaims: stringArrayField(value, source, "disallowedClaims")
  };
}

function stringField(record: Record<string, unknown>, source: string, key: string): string {
  const value = record[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new BenchmarkFixtureError(source, `${key} must be a non-empty string`);
}

function stringArrayField(record: Record<string, unknown>, source: string, key: string): readonly string[] {
  const value = record[key];
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim())) return value;
  throw new BenchmarkFixtureError(source, `${key} must be a non-empty string array`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
