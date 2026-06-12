import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { evaluateFieldEvidence } from "./field-evidence";
import { exists, readText } from "./fs";
import type { ServiceReadinessCheck } from "./service-readiness";

export async function fieldEvidenceCheck(root: string): Promise<ServiceReadinessCheck> {
  const fieldRoot = join(root, "evidence", "field-readiness");
  if (!await exists(fieldRoot)) {
    return { id: "field-evidence", status: "fail", evidence: "missing evidence/field-readiness/<run-id>" };
  }
  const runIds = await readdir(fieldRoot);
  if (runIds.length === 0) {
    return { id: "field-evidence", status: "fail", evidence: "missing evidence/field-readiness/<run-id>" };
  }
  const results = [];
  for (const runId of runIds) {
    const evidencePath = `evidence/field-readiness/${runId}`;
    const manifestStatus = await readManifestStatus(root, evidencePath);
    if (manifestStatus === "missing") {
      return { id: "field-evidence", status: "fail", evidence: `${evidencePath}/manifest.json manifest missing` };
    }
    if (manifestStatus === "fail") {
      return { id: "field-evidence", status: "fail", evidence: `${evidencePath}/manifest.json status fail` };
    }
    results.push(await evaluateFieldEvidence(root, runId, evidencePath));
  }
  const passing = results.filter((item) => item.status === "pass");
  const failures = results.filter((item) => item.status === "fail");
  if (failures.length) {
    return {
      id: "field-evidence",
      status: "fail",
      evidence: failures.map((item) => `${item.evidencePath}: ${item.checks.filter((check) => check.status === "fail").map((check) => check.id).join(", ")}`).join("; ")
    };
  }
  return {
    id: "field-evidence",
    status: passing.length ? "pass" : "fail",
    evidence: passing.length
      ? passing.map((item) => item.evidencePath).join(", ")
      : results.map((item) => `${item.evidencePath}: ${item.checks.filter((check) => check.status === "fail").map((check) => check.id).join(", ")}`).join("; ")
  };
}

async function readManifestStatus(root: string, evidencePath: string): Promise<"pass" | "fail" | "missing"> {
  const content = await readText(join(root, evidencePath, "manifest.json"));
  if (!content) return "missing";
  try {
    const parsed = JSON.parse(content) as unknown;
    return isPassManifest(parsed) ? "pass" : "fail";
  } catch {
    return "fail";
  }
}

function isPassManifest(value: unknown): boolean {
  return typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && "status" in value
    && value.status === "pass";
}
