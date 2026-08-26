import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const specDir = join(root, "spec", "evidence-format");

const SCHEMA_TARGETS = [
  { file: "schemas/plan-approval-challenge.json", tsType: "PlanApprovalChallenge" },
  { file: "schemas/execution-approval-challenge.json", tsType: "ExecutionApprovalChallenge" },
  { file: "schemas/receipt.json", tsTypes: ["PlanApprovalReceipt", "ExecutionApprovalReceipt"] },
] as const;

function extractTypeProps(source: string, typeName: string): string[] {
  const start = source.indexOf(`export type ${typeName} =`);
  if (start === -1) return [];
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let end = bodyStart;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}") { depth--; end = i; if (depth === 0) break; }
  }
  const body = source.slice(bodyStart, end + 1);
  return [...body.matchAll(/readonly\s+(\w+)\??:/g)].map((m) => m[1]);
}

describe("boulder evidence format spec v0", () => {
  test("schemas exist and mirror the shipped receipt types", async () => {
    const receiptsSource = await readFile(join(root, "src", "plan-receipts.ts"), "utf8");

    for (const target of SCHEMA_TARGETS) {
      const schemaPath = join(specDir, target.file);
      const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
        properties?: Record<string, unknown>;
      };
      const schemaProps = new Set(Object.keys(schema.properties ?? {}));

      const typeNames = "tsTypes" in target ? target.tsTypes : [target.tsType];
      for (const typeName of typeNames) {
        for (const prop of extractTypeProps(receiptsSource, typeName)) {
          expect(schemaProps.has(prop)).toBe(true);
        }
      }
    }
  });

  test("SPEC references every published schema file", async () => {
    const spec = await readFile(join(specDir, "SPEC.md"), "utf8");
    for (const target of SCHEMA_TARGETS) {
      expect(spec).toContain(target.file);
    }
  });
});
