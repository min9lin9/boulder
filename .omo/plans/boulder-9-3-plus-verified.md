# boulder-9-3-plus-verified - Work Plan

## TL;DR (For humans)

**What you'll get:** Boulder의 release/readiness/package/docs 운영 구조를 한 번 더 성숙시키는 계획입니다. 핵심은 수동으로 맞추던 release evidence를 한 모델에서 생성하고, package/docs/readiness/run-log를 각각 계약화해서 drift를 구조적으로 줄이는 것입니다.

**Why this approach:** 조사 결과 Boulder는 이미 테스트가 약한 프로젝트가 아닙니다. 문제는 검증이 흩어져 있고, 사람이 여러 evidence 파일을 함께 갱신해야 하는 구조입니다. 그래서 새 기능 확장보다 source-of-truth, contract, registry, recovery를 먼저 고정합니다.

**What it will NOT do:** hosted app, 모바일, 로그인, 웹사이트, SEO/GEO/AEO를 만들지 않습니다. npm 계정 2FA나 trusted publisher 설정을 repo-only로 검증했다고 주장하지 않습니다. raw workspace file body나 secret을 run log에 남기지 않습니다.

**Effort:** XL
**Risk:** High - release evidence, package contract, readiness architecture, local state, docs registry를 가로지르는 구조 변경입니다.
**Decisions to sanity-check:** repo-verifiable npm metadata/provenance checklist는 active scope이고, npm account/trusted-publisher configuration과 post-publish provenance evidence는 deferred external scope입니다. run logs는 full observability가 아니라 local structured events로 둡니다. 9.3+는 보장 점수가 아니라 review target입니다.

Your next move: `$omo:start-work`로 실행을 시작하거나, 이 계획을 더 좁은 Phase 1-only 계획으로 축소하세요. Full execution detail follows below.

---

> TL;DR (machine): XL/high-risk architecture plan; build generated release evidence, package/doc contracts, readiness registry, local run events, product workflow map, and optional npm provenance hardening.

## Scope

### Must have
- Add `src/release-evidence.ts` with `ReleaseEvidenceBundleV1`, `ReleaseEvidenceRenderer`, and `ReleaseEvidenceTarget` types. The exact renderer target set is:
  - `docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json`
  - `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt`
  - `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt`
  - `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt`
  - `docs/CASE_STUDIES/evidence/release-workflow/ci.txt`
  - `docs/CASE_STUDIES/evidence/release-workflow/release-plan.json`
  - `docs/PRODUCT_READINESS.md` release-check line only
- Add a release evidence refresh command with `--dry-run|--write` and checked-in drift tests.
- Add `fixtures/package-inventory/packaged-files.v0.json` and a contract test classifying every packed file exactly once. Allowed classes: `runtime`, `public-doc`, `case-study-evidence`, `fixture`, `skill`, `config`, `license`, `metadata`.
- Add `fixtures/docs/doc-registry.v0.json` for all packaged docs plus known local-only exclusions. Required fields: `path`, `kind`, `locale`, `dir`, `source`, `version`, `generatedBy`, `packaging`, `translatable`. Allowed `kind`: `canonical`, `translation`, `generated`, `local-only`.
- Introduce a readiness registry and migrate release/product/service readiness behind it without changing existing command output.
- Add evidence inspect/diff commands and a machine-readable recovery code taxonomy.
- Add local `.boulder/runs` structured event records with redaction, retention, and `runs list/show/prune`.
- Add a primary workflow map and help/README hierarchy around the main user path.
- Add active repo-verifiable npm metadata/provenance checklist docs. Defer external npm account/package trusted-publisher configuration and post-publish provenance evidence unless the maintainer supplies external-state proof.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- No hosted OpenAI Apps SDK app, plugin marketplace listing, mobile app, login surface, web app, SEO/GEO/AEO implementation.
- No custom npm token manager and no npm secret persistence.
- No claim that npm account/package settings are verified unless the evidence comes from npm/GitHub external state.
- No command output rewrite unless an output-parity test proves compatibility.
- No run log that stores raw workspace file bodies, credentials, private user data, or protected file content.
- No broad refactor of unrelated workflow profile, handoff, capability, routine, or service-readiness behavior.

## Verification strategy

> Zero human intervention - all verification is agent-executed.

- Test decision: tests-after for documentation-only scaffolding; TDD for new CLI commands, registries, run-event schema, package inventory, and evidence generation.
- Baseline characterization before architecture migration:
  - `bun bin/boulder.ts release-check --json`
  - `bun bin/boulder.ts product-readiness --json`
  - `bun bin/boulder.ts service-readiness --json`
  - `bun bin/boulder.ts release-plan --json`
  - `bun pm pack --dry-run --ignore-scripts`
- Baselines must be captured from a clean target ref or clean temp clone. The current dirty worktree may be used for planning evidence only, not for committed characterization fixtures.
- Required final verification:
  - `bunx tsc --noEmit`
  - focused tests for touched domains
  - `bun run ci`
  - release evidence drift check
  - package inventory contract check
  - doc registry consistency check
  - run-log redaction check with token/path/body fixtures
  - stale version grep over packaged release evidence and public docs
- Evidence directory: `.omo/evidence/boulder-9-3-plus-verified/`.

## Execution strategy

### Parallel execution waves

Wave 0: Clean-ref baseline characterization and fixture capture.

Wave 1: Drift ceiling removal.
- Release evidence bundle.
- Package inventory contract.
- Documentation registry contract.

Wave 2: Architecture generalization.
- Readiness registry.
- Recovery codes and evidence inspect/diff.

Wave 3: Local operations.
- Structured run events.
- Runs list/show.
- Retention and redaction.

Wave 4: Product clarity and external hardening.
- Workflow map/help/README hierarchy.
- Optional npm trusted publishing/provenance checklist.

Wave 5: Final compatibility and review.
- Output parity.
- Full CI.
- High Accuracy review.

### Dependency matrix

| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2, 3, 4, 6, 8 | none |
| 2 | 1 | 5, 6, F1-F4 | 3, 4 |
| 3 | 1 | 6, F1-F4 | 2, 4 |
| 4 | 1 | 7, F1-F4 | 2, 3 |
| 5 | 2 | 6, 8, F1-F4 | 7 |
| 6 | 2, 3, 5 | 8, F1-F4 | 7 |
| 7 | 4 | 8, F1-F4 | 5 |
| 8 | 5, 6, 7 | F1-F4 | 9 |
| 9 | 1 | F1-F4 | 8 |
| 10 | 1 | F1-F4 | 8, 9 |
| 11 | 2, 3, 4, 5, 6, 7, 8, 9, 10 | F1-F4 | none |

## Todos

> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [x] 1. Capture current behavior baselines and write committed characterization fixtures.
  What to do / Must NOT do: From a clean target ref or clean temp clone, capture JSON/markdown outputs for `release-check`, `product-readiness`, `service-readiness`, `release-plan`, and pack dry-run. Write committed fixtures under `test/fixtures/baselines/readiness-v0/`; keep `.omo/evidence/...` as transcripts only. Do not use the dirty planning worktree as the fixture source.
  Parallelization: Wave 0 | Blocked by: none | Blocks: 2, 3, 4, 6, 8
  References (executor has NO interview context - be exhaustive): `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/verify-current-state.md`; `src/release-check.ts`; `src/product-readiness.ts`; `src/service-readiness.ts`; `src/release-plan.ts`; `test/readiness-reports.test.ts`; `test/product-readiness.test.ts`; `test/cli-e2e.test.ts`
  Acceptance criteria (agent-executable): `test/fixtures/baselines/readiness-v0/` contains release-check, product-readiness, service-readiness, release-plan, and pack-dry-run fixtures; `.omo/evidence/boulder-9-3-plus-verified/task-1-baseline.txt` records the commands and exits.
  QA scenarios (name the exact tool + invocation): happy: `bash -lc 'for cmd in "bun bin/boulder.ts release-check --json" "bun bin/boulder.ts product-readiness --json" "bun bin/boulder.ts service-readiness --json" "bun bin/boulder.ts release-plan --json" "bun pm pack --dry-run --ignore-scripts"; do echo "$ $cmd"; bash -lc "$cmd"; echo "exit:$?"; done'`, binary observable: every command runs to completion, exit codes and JSON statuses are recorded, and the captured statuses match committed baselines; current release/product gates may be blocked if the clean target ref is blocked. Evidence `.omo/evidence/boulder-9-3-plus-verified/task-1-baseline.txt`; failure: `bun test test/readiness-baseline-fixtures.test.ts --test-name-pattern "blocks mismatched release manifest fixture"`, binary observable: exit 0 and assertion proves mismatched fixture/status drift is rejected, evidence `.omo/evidence/boulder-9-3-plus-verified/task-1-blocked-fixture.txt`.
  Commit: Y | `test(readiness): capture current gate baselines`.

- [x] 2. Implement recovery code seed and `ReleaseEvidenceBundle` model/renderers.
  What to do / Must NOT do: Add `src/recovery-codes.ts` with initial release/package evidence recovery codes, then add `src/release-evidence.ts` with `ReleaseEvidenceBundleV1` and renderers for the exact target set listed in Scope. Do not remove existing command behavior yet.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 5, 6, F1-F4
  References (executor has NO interview context - be exhaustive): `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/wave-1-explorer-architecture.md`; `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/wave-2-release-metadata-parity.md`; `src/release-check.ts`; `src/release-plan.ts`; `docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json`
  Acceptance criteria (agent-executable): unit tests prove a synthetic ready v0.1.16 bundle validates cleanly; current checked release-manifest/install evidence is allowed to fail as drift until Todo 5 refresh and must report stable recovery codes; mismatched package version, tag, CI commit, and pack file count are rejected with stable recovery codes from `src/recovery-codes.ts`.
  QA scenarios (name the exact tool + invocation): happy: `bun test test/release-evidence-bundle.test.ts`, binary observable: exit 0, ready fixture validates and checked evidence drift reports stable codes, evidence `.omo/evidence/boulder-9-3-plus-verified/task-2-bundle-tests.txt`; failure: `bun test test/release-evidence-bundle.test.ts --test-name-pattern mismatch`, binary observable: mismatch fixtures assert recovery codes including `release.version_mismatch`, `release.release_commit_mismatch`, and `release.pack_file_count_mismatch`, evidence `.omo/evidence/boulder-9-3-plus-verified/task-2-mismatch.txt`.
  Commit: Y | `feat(release): add release evidence bundle model`.

- [x] 3. Implement package inventory contract fixture.
  What to do / Must NOT do: Create `fixtures/package-inventory/packaged-files.v0.json` and a parser/contract test that classifies every packed file exactly once using only approved classes: `runtime`, `public-doc`, `case-study-evidence`, `fixture`, `skill`, `config`, `license`, `metadata`. Do not rely only on regex absence checks.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 6, F1-F4
  References (executor has NO interview context - be exhaustive): `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/wave-1-explorer-test-package.md`; `package.json`; `test/source-cleanliness.test.ts`; `test/cli-e2e.test.ts`; `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt`
  Acceptance criteria (agent-executable): `bun pm pack --dry-run --ignore-scripts` output is parsed and every packed file is classified exactly once; forbidden local artifacts are absent; required files are present.
  QA scenarios (name the exact tool + invocation): happy: `bun test test/package-inventory-contract.test.ts`, binary observable: exit 0, evidence `.omo/evidence/boulder-9-3-plus-verified/task-3-package-contract.txt`; failure: `bun test test/package-inventory-contract.test.ts --test-name-pattern "rejects unclassified packed files"`, binary observable: exit 0 and assertion proves the invalid manifest is rejected, evidence `.omo/evidence/boulder-9-3-plus-verified/task-3-unclassified-file.txt`.
  Commit: Y | `test(package): add inventory contract`.

- [x] 4. Implement documentation registry and i18n metadata contract.
  What to do / Must NOT do: Add `fixtures/docs/doc-registry.v0.json` covering all packaged docs plus known local-only exclusions. Each entry includes `path`, `kind`, `locale`, `dir`, `source`, `version`, `generatedBy`, `packaging`, and `translatable`. Do not force every local OMO/session artifact into package docs.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 7, F1-F4
  References (executor has NO interview context - be exhaustive): `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/wave-1-librarian-ops-docs.md`; `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/wave-1-web-official-standards.md`; `test/source-cleanliness.test.ts`; `docs/`
  Acceptance criteria (agent-executable): doc registry test rejects unclassified packaged docs, translation without source/version, generated doc without generator/source, and packaged local-only docs.
  QA scenarios (name the exact tool + invocation): happy: `bun test test/docs-registry.test.ts`, binary observable: exit 0, evidence `.omo/evidence/boulder-9-3-plus-verified/task-4-doc-registry.txt`; failure: `bun test test/docs-registry.test.ts --test-name-pattern "rejects translated docs without dir metadata"`, binary observable: exit 0 and assertion proves invalid registry is rejected, evidence `.omo/evidence/boulder-9-3-plus-verified/task-4-i18n-failure.txt`.
  Commit: Y | `test(docs): add documentation registry contract`.

- [x] 5. Add `boulder release evidence refresh --dry-run|--write`.
  What to do / Must NOT do: Wire subcommand-local parsing for `boulder release evidence refresh --dry-run|--write [--json]`. `--dry-run` prints planned diffs; `--write` updates only the exact renderer target set listed in Scope. Do not publish, tag, push, or call npm registry writes. Do not add `--write` as a global option.
  Parallelization: Wave 2 | Blocked by: 2 | Blocks: 6, 8, F1-F4
  References (executor has NO interview context - be exhaustive): `src/cli.ts`; `src/cli-format.ts`; `src/release-check.ts`; `src/release-plan.ts`; `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/SYNTHESIS.md`
  Acceptance criteria (agent-executable): dry-run exits 0 and reports every target file; write mode updates only the approved release evidence files; generated output equals checked-in evidence after write.
  QA scenarios (name the exact tool + invocation): happy: `bun bin/boulder.ts release evidence refresh --dry-run --json`, binary observable: exit 0 and JSON lists all seven target files, evidence `.omo/evidence/boulder-9-3-plus-verified/task-5-refresh-dry-run.json`; failure: `bun test test/release-evidence-refresh-cli-e2e.test.ts --test-name-pattern "blocks mismatched bundle without writes"`, binary observable: exit 0 and assertion proves CLI exits nonzero with recovery code and no writes, evidence `.omo/evidence/boulder-9-3-plus-verified/task-5-refresh-failure.txt`.
  Commit: Y | `feat(release): add evidence refresh command`.

- [x] 6. Add shared readiness registry and migrate existing gates with parity tests.
  What to do / Must NOT do: Introduce registry entries with id, category, severity, validator, evidence, recovery hint id, and formatter metadata. Migrate release/product/service readiness underneath while preserving JSON and markdown output.
  Parallelization: Wave 2 | Blocked by: 2, 3, 5 | Blocks: 8, F1-F4
  References (executor has NO interview context - be exhaustive): `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/wave-1-explorer-architecture.md`; `src/release-check.ts`; `src/product-readiness.ts`; `src/service-readiness.ts`; `test/readiness-reports.test.ts`; `test/product-readiness.test.ts`; `test/service-readiness.test.ts`
  Acceptance criteria (agent-executable): parity tests compare old baseline artifacts from Todo 1 against new registry-backed output; registry ordering is deterministic; recovery hint ids are present.
  QA scenarios (name the exact tool + invocation): happy: `bun test test/readiness-registry.test.ts test/readiness-reports.test.ts test/product-readiness.test.ts test/service-readiness.test.ts`, binary observable: exit 0, evidence `.omo/evidence/boulder-9-3-plus-verified/task-6-registry-tests.txt`; failure: `bun test test/readiness-registry.test.ts --test-name-pattern "rejects duplicate check ids"`, binary observable: exit 0 and assertion proves duplicate registry fixture is rejected, evidence `.omo/evidence/boulder-9-3-plus-verified/task-6-duplicate-id.txt`.
  Commit: Y | `refactor(readiness): introduce registry`.

- [x] 7. Add evidence lifecycle inspect/diff and recovery code taxonomy.
  What to do / Must NOT do: Extend the recovery code taxonomy and add subcommand-local parsing for `boulder evidence inspect [--cwd <path>] --json` and `boulder evidence diff --from <path> --to <path> --json`. Do not make prose next steps the only machine-facing output.
  Parallelization: Wave 2 | Blocked by: 4 | Blocks: 8, F1-F4
  References (executor has NO interview context - be exhaustive): `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/wave-1-librarian-ops-docs.md`; `src/field-evidence.ts`; `src/release-check.ts`; `src/product-readiness.ts`; `src/cli.ts`
  Acceptance criteria (agent-executable): inspect reports release/package/docs evidence states; diff reports changed evidence ids; blocked release fixture includes stable machine-readable recovery code.
  QA scenarios (name the exact tool + invocation): happy: `bun bin/boulder.ts evidence inspect --cwd . --json`, binary observable: exit 0 and JSON includes evidence state ids, evidence `.omo/evidence/boulder-9-3-plus-verified/task-7-inspect.json`; failure: `bun bin/boulder.ts evidence diff --from missing --to missing --json`, binary observable: exit 1 and JSON includes recovery code `evidence.input_missing`, evidence `.omo/evidence/boulder-9-3-plus-verified/task-7-diff-failure.json`.
  Commit: Y | `feat(evidence): add inspect diff and recovery codes`.

- [ ] 8. Add structured local run events under `.boulder/runs`.
  What to do / Must NOT do: Record local structured run events for exact commands: `release-check`, `product-readiness`, `service-readiness`, `release-plan`, `release evidence refresh`, `evidence inspect`, and `evidence diff`. Event fields: `schemaVersion`, `eventName`, `command`, `cwdHash`, `packageVersion`, `startedAt`, `completedAt`, `severity`, `status`, `checkIds`, `recoveryHintIds`, `artifactPaths`. Add `boulder runs list/show/prune --json`. Retention policy: `runs prune --older-than 30d --keep 200 --json`. Do not log raw workspace bodies, secrets, or protected file content.
  Parallelization: Wave 3 | Blocked by: 5, 6, 7 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/wave-1-librarian-ops-docs.md`; `src/routine.ts`; `src/handoff-paths.ts`; `src/profile-store.ts`; `src/field-evidence.ts`; `test/profile-state-safety-e2e.test.ts`
  Acceptance criteria (agent-executable): listed commands can opt into run event recording with subcommand-local `--record-run`; list/show/prune render JSON; run logs pass redaction/path-safety tests. Redaction rules: redact values matching `npm_`, `ghp_`, `sk-`, `sk-proj-`, `Bearer `, absolute protected include paths, and raw file bodies; store `cwdHash` rather than raw cwd when outside repo root.
  QA scenarios (name the exact tool + invocation): happy: `bun bin/boulder.ts release-check --json --record-run && bun bin/boulder.ts runs list --json && bun bin/boulder.ts runs show --latest --json`, binary observable: exits 0 and JSON includes `eventName`, `status`, `checkIds`, evidence `.omo/evidence/boulder-9-3-plus-verified/task-8-runs-list.json`; failure: `bun test test/run-events-redaction.test.ts`, binary observable: secret-like tokens and raw file bodies are absent from generated run JSON, evidence `.omo/evidence/boulder-9-3-plus-verified/task-8-redaction.txt`; cleanup: `bun bin/boulder.ts runs prune --older-than 30d --keep 200 --json`, evidence `.omo/evidence/boulder-9-3-plus-verified/task-8-prune.json`.
  Commit: Y | `feat(runs): add local structured run events`.

- [ ] 9. Add primary workflow map and help/README hierarchy.
  What to do / Must NOT do: Add `boulder workflow map --json` using schema `fixtures/workflow-map/primary-workflow.v0.json` and update help/README/docs so the main route is first-run -> profile -> capability -> handoff -> readiness. Do not bury core route under secondary routine/retro/proposal features.
  Parallelization: Wave 4 | Blocked by: 1 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `README.md`; `src/cli-format.ts`; `src/quickstart.ts`; `docs/CASE_STUDIES/README.md`; `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/SYNTHESIS.md`
  Acceptance criteria (agent-executable): workflow map JSON validates against `fixtures/workflow-map/primary-workflow.v0.json`; help route groups commands by lane; README first route follows primary workflow; tests assert secondary commands do not dominate first screen.
  QA scenarios (name the exact tool + invocation): happy: `bun bin/boulder.ts workflow map --json`, binary observable: exit 0 and JSON validates against `fixtures/workflow-map/primary-workflow.v0.json`, evidence `.omo/evidence/boulder-9-3-plus-verified/task-9-workflow-map.json`; failure: `bun test test/workflow-map.test.ts --test-name-pattern "rejects primary workflow without release-check"`, binary observable: exit 0 and assertion proves invalid map fixture is rejected, evidence `.omo/evidence/boulder-9-3-plus-verified/task-9-workflow-failure.txt`.
  Commit: Y | `feat(workflow): add primary workflow map`.

- [ ] 10. Add repo-verifiable npm metadata checklist and deferred external provenance hardening docs.
  What to do / Must NOT do: Add docs and release-check advisory items for repository URL compatibility, package metadata, package page README/metadata, optional SBOM/signature/provenance verification. Split external npm settings into a deferred checklist section: npm 2FA, token policy, trusted publisher config, GitHub-hosted runner proof, and post-publish provenance view. Do not require external npm state for local readiness unless evidence is supplied.
  Parallelization: Wave 4 | Blocked by: 1 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/wave-1-librarian-release-provenance.md`; `.omo/ulw-research/20260708-052436-boulder-9-3-plan-factcheck/wave-2-npm-github-expansion.md`; npm trusted publishing/provenance docs cited in synthesis; `.github/workflows/ci.yml`; `package.json`
  Acceptance criteria (agent-executable): docs distinguish repo-verifiable metadata from external npm account/package state; external npm trusted-publisher/account evidence never blocks local release-check unless explicitly supplied and requested; package metadata checks include repository/homepage/bugs/name/version/license and missing repo-verifiable metadata is a release-check failure with recovery code `package.metadata_missing`. Success criteria must restate that 9.3+ is a review target, not a guaranteed score.
  QA scenarios (name the exact tool + invocation): happy: `bun bin/boulder.ts release-check --json`, binary observable: exit 0 without external npm trusted-publisher evidence, evidence `.omo/evidence/boulder-9-3-plus-verified/task-10-release-check-ready.json`; failure: `bun test test/release-metadata.test.ts --test-name-pattern "blocks missing repository url"`, binary observable: exit 0 and assertion proves release-check fails with `package.metadata_missing`, evidence `.omo/evidence/boulder-9-3-plus-verified/task-10-metadata-failure.json`.
  Commit: Y | `docs(release): add provenance hardening checklist`.

- [ ] 11. Add final verification scripts and plan compliance test.
  What to do / Must NOT do: Add `test/plan-compliance.test.ts`, `script/qa/boulder-9-3-plus-manual-qa.sh`, and `script/qa/boulder-9-3-plus-scope-fidelity.sh`. These assets are final-gate infrastructure only; they must not duplicate implementation logic or hide failing commands.
  Parallelization: Wave 5 | Blocked by: 2, 3, 4, 5, 6, 7, 8, 9, 10 | Blocks: F1-F4
  References (executor has NO interview context - be exhaustive): `.omo/plans/boulder-9-3-plus-verified.md`; all task evidence paths under `.omo/evidence/boulder-9-3-plus-verified/`; `test/readiness-reports.test.ts`; `test/source-cleanliness.test.ts`; `test/cli-e2e.test.ts`
  Acceptance criteria (agent-executable): `test/plan-compliance.test.ts` verifies every todo evidence path exists and every Must NOT guardrail is checked; `script/qa/boulder-9-3-plus-manual-qa.sh` runs the exact real CLI surfaces listed in F3; `script/qa/boulder-9-3-plus-scope-fidelity.sh` runs the exact scope/redaction/external-state checks listed in F4; all scripts are executable and fail closed.
  QA scenarios (name the exact tool + invocation): happy: `bash -lc 'test -x script/qa/boulder-9-3-plus-manual-qa.sh && test -x script/qa/boulder-9-3-plus-scope-fidelity.sh && bun test test/plan-compliance.test.ts'`, binary observable: exit 0, evidence `.omo/evidence/boulder-9-3-plus-verified/task-11-final-assets.txt`; failure: `bun test test/plan-compliance.test.ts --test-name-pattern "fails when required evidence is missing"`, binary observable: exit 0 and assertion proves missing evidence fixture is rejected, evidence `.omo/evidence/boulder-9-3-plus-verified/task-11-missing-evidence.txt`.
  Commit: Y | `test(qa): add final verification assets`.

## Final verification wave

> Runs in parallel after ALL todos. ALL must return deterministic APPROVE/PASS artifacts before completion. No human approval is part of verification.

- [ ] F1. Plan compliance audit
  Invocation: `bun test test/plan-compliance.test.ts`.
  Binary observable: compliance test exits 0; the test itself fails closed if required evidence is missing, if todo/commit/evidence counts drift, or if forbidden-scope implementation hits appear outside explicit non-goal docs.
  Evidence: `.omo/evidence/boulder-9-3-plus-verified/f1-plan-compliance.txt`.

- [ ] F2. Code quality review
  Invocation: `multi_agent_v1.spawn_agent({"agent_type":"lazycodex-code-reviewer","fork_context":false,"message":"TASK: final code review for Boulder 9.3+ implementation. DELIVERABLE: return OKAY only if implementation matches .omo/plans/boulder-9-3-plus-verified.md with no blockers, otherwise ITERATE with file/line blockers. SCOPE: review git diff, .omo/evidence/boulder-9-3-plus-verified/, test/plan-compliance.test.ts, script/qa/boulder-9-3-plus-manual-qa.sh, script/qa/boulder-9-3-plus-scope-fidelity.sh. VERIFY: inspect code quality, output parity, redaction, scope fidelity, package/docs contracts, and final QA artifacts. Final must start OKAY or ITERATE."})`; capture final message to `.omo/evidence/boulder-9-3-plus-verified/f2-code-review.md`.
  Binary observable: final reviewer message starts `OKAY:`.
  Evidence: `.omo/evidence/boulder-9-3-plus-verified/f2-code-review.md`.

- [ ] F3. Real manual QA
  Invocation: `bash script/qa/boulder-9-3-plus-manual-qa.sh`. The script must run release refresh dry-run, package inventory test, docs registry test, evidence inspect/diff, runs list/show/prune, workflow map, release/product/service readiness in a clean temp repo and root repo.
  Binary observable: script exits 0 and emits artifact paths.
  Evidence: `.omo/evidence/boulder-9-3-plus-verified/f3-manual-qa.txt`.

- [ ] F4. Scope fidelity
  Invocation: `bash script/qa/boulder-9-3-plus-scope-fidelity.sh`. The script must check scope grep, external-state claim wording, and run-log redaction fixtures.
  Binary observable: script exits 0.
  Evidence: `.omo/evidence/boulder-9-3-plus-verified/f4-scope-fidelity.txt`.

## Commit strategy

- Use atomic Conventional Commits.
- Keep baseline/evidence fixture commits separate from architecture commits when possible.
- Suggested commit order:
  1. `test(readiness): capture current gate baselines`
  2. `feat(release): add release evidence bundle model`
  3. `test(package): add inventory contract`
  4. `test(docs): add documentation registry contract`
  5. `feat(release): add evidence refresh command`
  6. `refactor(readiness): introduce registry`
  7. `feat(evidence): add inspect diff and recovery codes`
  8. `feat(runs): add local structured run events`
  9. `feat(workflow): add primary workflow map`
  10. `docs(release): add provenance hardening checklist`
- Final commit footers should include: `Plan: .omo/plans/boulder-9-3-plus-verified.md`.

## Success criteria

- Release evidence artifacts are generated from one model and checked for drift.
- Package dry-run output is governed by one classified inventory contract.
- Documentation packaging/i18n/generated/local-only status is governed by one registry.
- Release/product/service readiness use a shared registry while preserving existing JSON/markdown outputs.
- Evidence inspect/diff and recovery codes make readiness failures machine-readable.
- `.boulder/runs` records local structured events with redaction and retention.
- README/help/workflow map present one primary user route.
- npm trusted publishing/provenance is documented as optional external hardening with clear repo-verifiable vs external-state boundaries.
- 9.3+ is documented as a review target; the implementation must not claim a guaranteed score without independent post-implementation review.
- `bunx tsc --noEmit`, focused tests, `bun run ci`, pack dry-run, and stale-version checks pass.
- High Accuracy Review returns unconditional approval after implementation.
