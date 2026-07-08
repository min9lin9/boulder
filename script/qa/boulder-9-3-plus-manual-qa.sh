#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_DIR="$ROOT/.omo/evidence/boulder-9-3-plus-verified"
JSON_EVIDENCE_DIR="$EVIDENCE_DIR/manual-qa-json"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

run_json_allow_blocked() {
  local label="$1"
  shift
  local output="$JSON_EVIDENCE_DIR/${label}.json"
  echo "command:$label $*"
  set +e
  "$@" >"$output"
  local exit_code=$?
  set -e
  printf '%s\n' "$exit_code" >"$output.exit"
  bun -e 'const fs=require("fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));' "$output"
  echo "$label exit:$exit_code path:$output"
}

run_json_strict() {
  local label="$1"
  shift
  local output="$JSON_EVIDENCE_DIR/${label}.json"
  echo "command:$label $*"
  "$@" >"$output"
  printf '0\n' >"$output.exit"
  bun -e 'const fs=require("fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));' "$output"
  echo "$label path:$output"
}

mkdir -p "$EVIDENCE_DIR"
rm -rf "$JSON_EVIDENCE_DIR"
mkdir -p "$JSON_EVIDENCE_DIR"
CLEAN_ROOT="$TMP_ROOT/clean"
mkdir "$CLEAN_ROOT"
git -C "$ROOT" archive HEAD | tar -x -C "$CLEAN_ROOT"
RUN_ROOT="$TMP_ROOT/run-root"
mkdir "$RUN_ROOT"
git -C "$ROOT" archive HEAD | tar -x -C "$RUN_ROOT"

echo "root:$ROOT"
echo "clean:$CLEAN_ROOT"

run_json_allow_blocked release-refresh bun "$ROOT/bin/boulder.ts" release evidence refresh --dry-run --json --cwd "$ROOT"
bun test "$ROOT/test/package-inventory-contract.test.ts"
bun test "$ROOT/test/docs-registry.test.ts"
run_json_allow_blocked evidence-inspect bun "$ROOT/bin/boulder.ts" evidence inspect --cwd "$ROOT" --json
run_json_allow_blocked evidence-diff-missing bun "$ROOT/bin/boulder.ts" evidence diff --from "$TMP_ROOT/missing-a" --to "$TMP_ROOT/missing-b" --json
run_json_strict workflow-map bun "$ROOT/bin/boulder.ts" workflow map --json
run_json_allow_blocked release-check bun "$ROOT/bin/boulder.ts" release-check --cwd "$ROOT" --json
run_json_allow_blocked product-readiness bun "$ROOT/bin/boulder.ts" product-readiness --cwd "$ROOT" --json
run_json_allow_blocked service-readiness bun "$ROOT/bin/boulder.ts" service-readiness --cwd "$ROOT" --json
run_json_allow_blocked run-root-release-check bun "$ROOT/bin/boulder.ts" release-check --cwd "$RUN_ROOT" --json --record-run
run_json_strict runs-list bun "$ROOT/bin/boulder.ts" runs list --cwd "$RUN_ROOT" --json
run_json_strict runs-show bun "$ROOT/bin/boulder.ts" runs show --latest --cwd "$RUN_ROOT" --json
run_json_strict runs-prune bun "$ROOT/bin/boulder.ts" runs prune --older-than 30d --keep 200 --cwd "$RUN_ROOT" --json

run_json_allow_blocked clean-release-check bun "$ROOT/bin/boulder.ts" release-check --cwd "$CLEAN_ROOT" --json
run_json_allow_blocked clean-product-readiness bun "$ROOT/bin/boulder.ts" product-readiness --cwd "$CLEAN_ROOT" --json
run_json_allow_blocked clean-service-readiness bun "$ROOT/bin/boulder.ts" service-readiness --cwd "$CLEAN_ROOT" --json
run_json_allow_blocked clean-release-refresh bun "$ROOT/bin/boulder.ts" release evidence refresh --dry-run --json --cwd "$CLEAN_ROOT"

bun -e '
const fs = require("fs");
const paths = {
  refresh: process.argv[1],
  inspect: process.argv[2],
  diffMissing: process.argv[3],
  release: process.argv[4],
  product: process.argv[5],
  service: process.argv[6],
  runRootRelease: process.argv[7],
  cleanRefresh: process.argv[8],
  cleanRelease: process.argv[9],
  cleanProduct: process.argv[10],
  cleanService: process.argv[11]
};
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const exitCode = (path) => Number(fs.readFileSync(`${path}.exit`, "utf8").trim());
const refresh = read(paths.refresh);
const inspect = read(paths.inspect);
const diffMissing = read(paths.diffMissing);
const release = read(paths.release);
const product = read(paths.product);
const service = read(paths.service);
const runRootRelease = read(paths.runRootRelease);
const cleanRefresh = read(paths.cleanRefresh);
const cleanRelease = read(paths.cleanRelease);
const cleanProduct = read(paths.cleanProduct);
const cleanService = read(paths.cleanService);
const exits = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, exitCode(path)]));
function assertBlocked(report, label) {
  if (report.status !== "blocked") {
    console.error(`${label} must remain blocked without current external release evidence`);
    process.exit(1);
  }
}
function assertReady(report, label) {
  if (report.status !== "ready") {
    console.error(`${label} must be ready`);
    process.exit(1);
  }
  console.log(`assert:${label} ready`);
}
function assertExit(key, expected, label) {
  if (exits[key] !== expected) {
    console.error(`${label} exit mismatch expected:${expected} actual:${exits[key]}`);
    process.exit(1);
  }
  console.log(`assert:${label} exit ${expected}`);
}
function assertSameIds(actual, expected, label) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) {
    console.error(`${label} mismatch expected:${sortedExpected.join(", ")} actual:${sortedActual.join(", ")}`);
    process.exit(1);
  }
  console.log(`assert:${label} ${expected.join(",")}`);
}
function assertRefreshExpected(report, label) {
  if (report.status === "ready") {
    if ((report.issues || []).length) {
      console.error(`${label} release refresh ready output must not include issues`);
      process.exit(1);
    }
    console.log(`assert:${label} release-refresh ready`);
    return;
  }
  assertBlocked(report, label);
  const codes = (report.issues || []).map((issue) => issue.code);
  if (!codes.includes("release.version_mismatch")) {
    console.error(`${label} release refresh must block on release.version_mismatch`);
    process.exit(1);
  }
  console.log(`assert:${label} release-refresh release.version_mismatch`);
}
function assertInspectPass(report) {
  if (report.status !== "pass") {
    console.error("evidence-inspect must pass when release evidence is current");
    process.exit(1);
  }
  console.log("assert:evidence-inspect pass");
}
function assertDiffMissing(report) {
  if (report.status !== "blocked" || report.recoveryCode !== "evidence.input_missing") {
    console.error("evidence-diff-missing must block with evidence.input_missing");
    process.exit(1);
  }
  const codes = (report.issues || []).map((issue) => issue.code);
  assertSameIds(codes, ["evidence.input_missing", "evidence.input_missing"], "evidence-diff missing issue codes");
}
assertRefreshExpected(refresh, "root");
assertExit("refresh", 0, "root release-refresh");
assertInspectPass(inspect);
assertExit("inspect", 0, "evidence-inspect");
assertDiffMissing(diffMissing);
assertExit("diffMissing", 1, "evidence-diff missing");
assertReady(release, "root release-check");
assertExit("release", 0, "root release-check");
assertReady(product, "root product-readiness");
assertExit("product", 0, "root product-readiness");
assertReady(service, "root service-readiness");
assertExit("service", 0, "root service-readiness");
assertReady(runRootRelease, "run-root release-check");
assertExit("runRootRelease", 0, "run-root release-check");
assertRefreshExpected(cleanRefresh, "clean archive");
assertExit("cleanRefresh", 0, "clean archive release-refresh");
assertReady(cleanRelease, "clean archive release-check");
assertExit("cleanRelease", 0, "clean archive release-check");
assertReady(cleanProduct, "clean archive product-readiness");
assertExit("cleanProduct", 0, "clean archive product-readiness");
assertReady(cleanService, "clean archive service-readiness");
assertExit("cleanService", 0, "clean archive service-readiness");
' "$JSON_EVIDENCE_DIR/release-refresh.json" "$JSON_EVIDENCE_DIR/evidence-inspect.json" "$JSON_EVIDENCE_DIR/evidence-diff-missing.json" "$JSON_EVIDENCE_DIR/release-check.json" "$JSON_EVIDENCE_DIR/product-readiness.json" "$JSON_EVIDENCE_DIR/service-readiness.json" "$JSON_EVIDENCE_DIR/run-root-release-check.json" "$JSON_EVIDENCE_DIR/clean-release-refresh.json" "$JSON_EVIDENCE_DIR/clean-release-check.json" "$JSON_EVIDENCE_DIR/clean-product-readiness.json" "$JSON_EVIDENCE_DIR/clean-service-readiness.json"

echo "manual qa complete"
