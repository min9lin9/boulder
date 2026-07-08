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
  bun -e 'const fs=require("fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));' "$output"
  echo "$label exit:$exit_code path:$output"
}

run_json_strict() {
  local label="$1"
  shift
  local output="$JSON_EVIDENCE_DIR/${label}.json"
  echo "command:$label $*"
  "$@" >"$output"
  bun -e 'const fs=require("fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));' "$output"
  echo "$label path:$output"
}

mkdir -p "$EVIDENCE_DIR"
rm -rf "$JSON_EVIDENCE_DIR"
mkdir -p "$JSON_EVIDENCE_DIR"
git -C "$ROOT" archive HEAD | tar -x -C "$TMP_ROOT"
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
function failingIds(report) {
  return (report.checks || []).filter((check) => check.status === "fail").map((check) => check.id);
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
function assertReleaseBlocked(report, label, expectedFailures) {
  assertBlocked(report, label);
  const failing = failingIds(report);
  const missing = expectedFailures.filter((id) => !failing.includes(id));
  const unexpected = failing.filter((id) => !expectedFailures.includes(id));
  if (missing.length || unexpected.length) {
    console.error(`${label} release-check blockers mismatch missing:${missing.join(", ")} unexpected:${unexpected.join(", ")}`);
    process.exit(1);
  }
  console.log(`assert:${label} release-check ${expectedFailures.join(",")}`);
}
function assertProductBlocked(report, label) {
  assertBlocked(report, label);
  const publicRelease = (report.checks || []).find((check) => check.id === "public-release-check");
  if (!publicRelease || publicRelease.status !== "fail") {
    console.error(`${label} product-readiness must fail public-release-check`);
    process.exit(1);
  }
  console.log(`assert:${label} product-readiness public-release-check`);
}
function assertServicePilotReady(report, label) {
  if (report.status !== "pilot-ready") {
    console.error(`${label} service-readiness must remain pilot-ready`);
    process.exit(1);
  }
  const productReadiness = (report.checks || []).find((check) => check.id === "product-readiness");
  if (!productReadiness || productReadiness.status !== "fail") {
    console.error(`${label} service-readiness must fail product-readiness`);
    process.exit(1);
  }
  console.log(`assert:${label} service-readiness product-readiness`);
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
assertInspectPass(inspect);
assertDiffMissing(diffMissing);
assertReady(release, "root release-check");
assertReady(product, "root product-readiness");
assertReady(service, "root service-readiness");
assertReady(runRootRelease, "run-root release-check");
assertRefreshExpected(cleanRefresh, "clean archive");
assertReady(cleanRelease, "clean archive release-check");
assertReady(cleanProduct, "clean archive product-readiness");
assertReady(cleanService, "clean archive service-readiness");
' "$JSON_EVIDENCE_DIR/release-refresh.json" "$JSON_EVIDENCE_DIR/evidence-inspect.json" "$JSON_EVIDENCE_DIR/evidence-diff-missing.json" "$JSON_EVIDENCE_DIR/release-check.json" "$JSON_EVIDENCE_DIR/product-readiness.json" "$JSON_EVIDENCE_DIR/service-readiness.json" "$JSON_EVIDENCE_DIR/run-root-release-check.json" "$JSON_EVIDENCE_DIR/clean-release-refresh.json" "$JSON_EVIDENCE_DIR/clean-release-check.json" "$JSON_EVIDENCE_DIR/clean-product-readiness.json" "$JSON_EVIDENCE_DIR/clean-service-readiness.json"

echo "manual qa complete"
