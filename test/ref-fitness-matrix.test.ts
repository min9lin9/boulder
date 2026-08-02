import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";
import { evaluateCapabilityDoctor } from "../src/capability-doctor";
import { removeTempRepo, tempRepo } from "./helpers/cli";

const root = join(import.meta.dir, "..");

// Traced matrix for strategy section 9 (reference/…v0.2.md): enforced rows name the test files
// that prove the guard; planned rows name the REF-E/REF-PR experiment that must make it executable.
type MatrixRow = {
  readonly id: string;
  readonly status: "enforced" | "planned";
  readonly evidence: readonly string[];
};

const matrix: readonly MatrixRow[] = [
  { id: "boundary_kernel_must_not_import_senpi", status: "enforced", evidence: ["test/ref-fitness-matrix.test.ts"] },
  { id: "boundary_kernel_must_not_import_gajae_code", status: "enforced", evidence: ["test/ref-fitness-matrix.test.ts"] },
  { id: "boundary_host_adapter_must_not_own_domain_policy", status: "planned", evidence: ["REF-PR-2"] },
  { id: "contract_runtime_adapter_accepts_minimum_valid", status: "planned", evidence: ["REF-PR-2"] },
  { id: "contract_procedure_rejects_unknown_field", status: "enforced", evidence: ["test/v2-procedure.test.ts", "fixtures/v2-procedure/invalid-ref-e-sop-01.json"] },
  { id: "contract_procedure_requires_bounded_loop", status: "enforced", evidence: ["test/v2-procedure.test.ts", "fixtures/v2-procedure/invalid-ref-e-sop-01.json"] },
  { id: "boundary_procedure_must_not_reference_runtime_literal", status: "enforced", evidence: ["test/v2-procedure.test.ts", "fixtures/v2-procedure/invalid-ref-e-sop-01.json"] },
  { id: "contract_runtime_event_rejects_unknown_terminal", status: "planned", evidence: ["REF-PR-2"] },
  { id: "contract_gate_answer_requires_idempotency_key", status: "planned", evidence: ["REF-PR-2"] },
  { id: "workflow_acceptance_is_not_completion", status: "enforced", evidence: ["test/v2-work.test.ts"] },
  { id: "workflow_retry_preserves_revision", status: "planned", evidence: ["REF-E-WORK-01"] },
  { id: "workflow_critique_material_change_creates_revision", status: "planned", evidence: ["REF-E-WORK-01"] },
  { id: "workflow_completion_requires_terminal_receipt", status: "planned", evidence: ["REF-E-WORK-01"] },
  { id: "doctor_probe_must_not_mutate", status: "enforced", evidence: ["test/ref-fitness-matrix.test.ts"] },
  { id: "doctor_runtime_unavailable_is_not_pass", status: "enforced", evidence: ["test/capability-doctor-failures.test.ts"] },
  { id: "kit_must_not_reference_runtime_literal", status: "planned", evidence: ["REF-E-KIT-01"] },
  { id: "profile_must_not_reference_domain_vocabulary", status: "planned", evidence: ["REF-E-KIT-01"] },
  { id: "second_kit_requires_zero_kernel_change", status: "planned", evidence: ["REF-E-KIT-01"] },
  { id: "update_default_is_plan_not_apply", status: "planned", evidence: ["REF-PR-11"] },
  { id: "update_apply_requires_approval", status: "planned", evidence: ["REF-PR-11"] },
  { id: "update_failure_requires_verification_or_rollback", status: "planned", evidence: ["REF-PR-11"] },
  { id: "compound_candidate_never_auto_promotes", status: "planned", evidence: ["REF-E-SOP-04"] },
  { id: "repo_no_process_exit_in_src", status: "enforced", evidence: ["test/ref-fitness-matrix.test.ts"] },
  { id: "repo_zero_runtime_dependencies", status: "enforced", evidence: ["test/ref-fitness-matrix.test.ts"] },
  { id: "import_cohort_plan_stack_uses_explicit_js", status: "enforced", evidence: ["test/ref-fitness-matrix.test.ts"] },
  { id: "boundary_k2af_sibling_only_imports", status: "enforced", evidence: ["test/ref-fitness-matrix.test.ts"] },
  { id: "k1_k4_anti_overclaim", status: "enforced", evidence: ["test/ref-fitness-matrix.test.ts"] }
];

const strategyFitnessFunctions = [
  "boundary_kernel_must_not_import_senpi",
  "boundary_kernel_must_not_import_gajae_code",
  "boundary_host_adapter_must_not_own_domain_policy",
  "contract_runtime_adapter_accepts_minimum_valid",
  "contract_procedure_rejects_unknown_field",
  "contract_procedure_requires_bounded_loop",
  "boundary_procedure_must_not_reference_runtime_literal",
  "contract_runtime_event_rejects_unknown_terminal",
  "contract_gate_answer_requires_idempotency_key",
  "workflow_acceptance_is_not_completion",
  "workflow_retry_preserves_revision",
  "workflow_critique_material_change_creates_revision",
  "workflow_completion_requires_terminal_receipt",
  "doctor_probe_must_not_mutate",
  "doctor_runtime_unavailable_is_not_pass",
  "kit_must_not_reference_runtime_literal",
  "profile_must_not_reference_domain_vocabulary",
  "second_kit_requires_zero_kernel_change",
  "update_default_is_plan_not_apply",
  "update_apply_requires_approval",
  "update_failure_requires_verification_or_rollback",
  "compound_candidate_never_auto_promotes"
] as const;

async function filesUnder(path: string): Promise<string[]> {
  const entries = await readdir(path);
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(path, entry);
    return (await stat(entryPath)).isDirectory() ? filesUnder(entryPath) : [entryPath];
  }));
  return files.flat();
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1]);
}

describe("ref fitness matrix", () => {
  test("covers every strategy section 9 fitness function exactly once", () => {
    const ids = matrix.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of strategyFitnessFunctions) {
      expect(ids).toContain(id);
    }
  });

  test("keeps enforced evidence real and planned rows namespaced", async () => {
    const problems: string[] = [];
    for (const row of matrix) {
      if (row.evidence.length === 0) problems.push(`${row.id} has no evidence`);
      if (row.status === "enforced") {
        for (const path of row.evidence) {
          const info = await stat(join(root, path)).catch(() => null);
          if (info === null) problems.push(`${row.id} evidence path missing: ${path}`);
        }
      } else {
        for (const ref of row.evidence) {
          if (!/^REF-(E|PR)-[A-Z0-9-]+$/.test(ref)) problems.push(`${row.id} planned ref not namespaced: ${ref}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("ref boundary guards", () => {
  test("kernel and domain code never import runtime-host packages", async () => {
    const forbidden = /^(?:@?senpi|gajae-code|@?gajae|callee|@callee)(?:\/|$)/;
    const srcFiles = (await filesUnder(join(root, "src"))).filter((path) => path.endsWith(".ts"));
    expect(srcFiles.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const path of srcFiles) {
      const specifiers = importSpecifiers(await readFile(path, "utf8"));
      for (const specifier of specifiers) {
        if (forbidden.test(specifier)) hits.push(`${relative(root, path)} imports ${specifier}`);
      }
    }
    expect(hits).toEqual([]);
  });

  test("k2a-f keeps sibling-only imports with explicit .js specifiers", async () => {
    const files = (await filesUnder(join(root, "src/k2a-f"))).filter((path) => path.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const path of files) {
      const specifiers = importSpecifiers(await readFile(path, "utf8"));
      for (const specifier of specifiers) {
        if (!specifier.startsWith("./")) violations.push(`${relative(root, path)} imports non-sibling ${specifier}`);
        else if (!specifier.endsWith(".js")) violations.push(`${relative(root, path)} lacks .js on ${specifier}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test("plan and planner stack uses explicit .js relative specifiers", async () => {
    const srcFiles = (await filesUnder(join(root, "src"))).filter((path) => path.endsWith(".ts"));
    const cohort = srcFiles.filter((path) => /(?:^|\/)(?:plan|planner|planning|execution)-[^/]*\.ts$/.test(path) || /(?:^|\/)common-executor-evidence\.ts$/.test(path));
    expect(cohort.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const path of cohort) {
      const specifiers = importSpecifiers(await readFile(path, "utf8"));
      for (const specifier of specifiers) {
        if (specifier.startsWith(".") && !specifier.endsWith(".js")) violations.push(`${relative(root, path)} lacks .js on ${specifier}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("ref repo guards", () => {
  test("src never calls process.exit", async () => {
    const srcFiles = (await filesUnder(join(root, "src"))).filter((path) => path.endsWith(".ts"));
    const offenders: string[] = [];
    for (const path of srcFiles) {
      const source = await readFile(path, "utf8");
      if (source.includes("process.exit(")) offenders.push(relative(root, path));
    }
    expect(offenders).toEqual([]);
  });

  test("package.json declares zero runtime dependencies", async () => {
    const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { readonly dependencies?: Record<string, string> };
    expect(Object.keys(manifest.dependencies ?? {})).toEqual([]);
  });

  test("v2 sources and public docs make no K2-K4 authority claims", async () => {
    const v2Files = [
      ...(await filesUnder(join(root, "src/v2"))).filter((path) => path.endsWith(".ts")),
      join(root, "src/v2-command.ts")
    ];
    const claims: string[] = [];
    for (const path of v2Files) {
      const source = await readFile(path, "utf8");
      if (/\bK[234]\b/.test(source)) claims.push(`${relative(root, path)} references unproven gates`);
      if (/kit|pack/i.test(source)) claims.push(`${relative(root, path)} claims Kit or Pack behavior`);
    }
    expect(claims).toEqual([]);
    const readme = await readFile(join(root, "README.md"), "utf8");
    expect(readme.includes("boulder v2")).toBe(false);
  });

  test("doctor probe does not mutate the inspected tree", async () => {
    const probe = await tempRepo("boulder-ref-doctor-");
    try {
      const before = (await filesUnder(probe)).sort();
      const report = await evaluateCapabilityDoctor(probe);
      expect(report.issues.length).toBeGreaterThan(0);
      const after = (await filesUnder(probe)).sort();
      expect(after).toEqual(before);
    } finally {
      await removeTempRepo(probe);
    }
  });
});
