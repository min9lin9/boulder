# Boulder Existing Project Gap Remediation Plan

Status: planning
Date: 2026-07-04
Target worktree: `codex/bootstrap-designer-mvp`
Scope: gaps not covered by `plans/boulder-capability-lifecycle-gap-audit.md`

## TL;DR

Capability lifecycle is the next architectural fix, but Boulder also has existing product gaps that will block repeatable external use even after lifecycle work lands.

The strongest uncovered gaps are:

1. the packaged local Codex skill story is incomplete
2. release gates say `ready` but still print publish/tag/release next commands
3. quickstart and bootstrap interview are not one coherent first-run route
4. bootstrap recommendations do not map to setup commands for non-code capabilities
5. service-readiness can be `ready` while some strategy docs still describe sample-backed or non-field-backed evidence
6. handoff defaults are adapter-first, not active-profile/lane-first
7. readiness gates rely heavily on string presence rather than structured evidence provenance

This plan should run after the current routine/retro MVP. It uses the capability lifecycle audit as architectural context, but it does not wait for lifecycle implementation because its P0 fixes are independent product-surface gaps.

## Reinvestigation Evidence

Commands run:

```bash
bun bin/boulder.ts --help
bun bin/boulder.ts release-check --cwd . --json
bun bin/boulder.ts product-readiness --cwd . --json
bun bin/boulder.ts service-readiness --cwd . --json
bun bin/boulder.ts quickstart --cwd . --json
bun bin/boulder.ts bootstrap interview --cwd . --task "research private corpus" --json
```

Files inspected:

- `package.json`
- `src/cli.ts`
- `src/cli-format.ts`
- `src/quickstart.ts`
- `src/bootstrap-interview.ts`
- `src/release-check.ts`
- `src/product-readiness.ts`
- `src/service-readiness.ts`
- `src/handoff-command.ts`
- `skills/boulder/SKILL.md`
- `skills/boulder/scripts/boulder-local.sh`
- `test/source-cleanliness.test.ts`
- `docs/SERVICE_STRATEGY_REVIEW.md`
- `docs/OPERATING_METRICS.md`

Current observed state:

- Package version and CLI version are both `0.1.15`.
- `release-check`, `product-readiness`, and `service-readiness` currently return `ready`.
- `quickstart` returns source import previews plus generic profile steps.
- `bootstrap interview` can recommend `research-corpus` and RAG/DB needs, but setup commands stay limited to GJC, LazyCodex, and agency-agents.
- `package.json.files` includes `skills/boulder-bootstrap-designer`, but not `skills/boulder`.
- `skills/boulder/scripts/boulder-local.sh` defaults `BOULDER_HOME` to a local absolute path under `/Users/burt/.../work/boulder`.

## P0 Gaps

### 1. Packaged Codex Skill Distribution Gap

The public product story says local Codex users should prefer the `boulder` skill, but `package.json.files` ships only `skills/boulder-bootstrap-designer`. The main `skills/boulder` wrapper is present in the repo but not included in the npm package file list.

Risk:

- External users can install `boulder-oss-cli` but not get the main Codex skill surface.
- Docs imply a `boulder` skill path that is local to this developer machine.
- `boulder-local.sh` and related `skills/boulder/references/*` docs can carry hardcoded local checkout assumptions, which are not portable.

Required fix:

- Decide whether `skills/boulder` is shipped as product surface.
- If yes, include it in `package.json.files`, remove local absolute defaults from the wrapper and `skills/boulder/references/*`, and add package smoke evidence.
- If no, docs must say the `boulder` Codex skill is a separate local install path, not part of the npm package.

Acceptance:

```bash
bun pm pack --dry-run --ignore-scripts
rg -n "/Users/burt|files-mentioned-by-the-user-codex|work/boulder" skills README.md docs package.json
```

The pack dry-run must show the intended skill files, and the grep must not find hardcoded local paths in shipped skill docs/scripts, including `skills/boulder/references/usage.ko.md`.

### 2. Release Check Next Command Drift

`release-check --json` returns `status: ready`, but `nextCommands` still says:

```text
bun run ci
npm publish --access public
git tag v0.1.15 ...
gh release create v0.1.15 ...
```

Risk:

- A ready release can still tell the operator to republish or recreate already-completed release state.
- This is dangerous for npm/tag/release flows because those actions are irreversible or error-prone.

Required fix:

- Split release output into `verificationCommands`, `remainingActions`, and `alreadySatisfied`.
- When every release check passes, `remainingActions` should not include publish/tag/release creation.
- Keep `bun run ci` as a verification recommendation only.

Acceptance:

```bash
bun bin/boulder.ts release-check --cwd . --json
```

When status is `ready`, JSON must not recommend `npm publish`, `git tag`, or `gh release create` as remaining actions.

### 3. First-Run Route Split Between Quickstart and Bootstrap

`quickstart` is the first-run route, while `bootstrap interview` is the profile recommendation route. They are not yet one coherent path.

Current mismatch:

- `quickstart` tells users to `profile use programming-default`.
- `bootstrap interview` recommends `programming-heavy`, `research-corpus`, `release-safe`, `issue-triage`, or `docs-reviewer`.
- The user has to know when to run bootstrap before quickstart.

Required fix:

- Add a deterministic quickstart step that points unsure users to `boulder bootstrap interview --task "<work>"`.
- Add optional `quickstart --task <text>` later only if the simple docs/step path is insufficient.
- Keep `quickstart` non-mutating.
- Use an explicit step id, `bootstrap-interview`, so docs/tests can pin the first-run route.

Acceptance:

```bash
bun bin/boulder.ts quickstart --cwd . --json
```

Output must include a `bootstrap-interview` step before the generic `profile-use` step, or explicitly report that the active profile was already selected from a prior bootstrap interview.

### 4. Bootstrap Recommendation-to-Command Parity Gap

For `research private corpus`, bootstrap correctly recommends:

- `research-corpus`
- `context-mode`
- `web search`
- `private corpus`
- `citation ledger`

But its commands only include:

- `profile use research-corpus`
- import GJC
- import LazyCodex
- import agency-agents
- quickstart
- doctor

Risk:

- The report tells the user what they need but does not show the next setup path for RAG, DB/ledger, or context providers.
- Non-developers will assume the printed commands complete the setup when they do not.

Required fix:

- Until capability lifecycle is implemented, add an additive `unsupportedCapabilityNotes` field for RAG/DB/context recommendations.
- Do not invent install commands.
- The report should explicitly say which recommendations have commands and which are planning-only.

Acceptance:

```bash
bun bin/boulder.ts bootstrap interview --task "research private corpus" --json
```

JSON must make it impossible to confuse `capabilityPlan.rag/db` with executable setup commands: every RAG/DB/context recommendation without a command must appear in `unsupportedCapabilityNotes`.

## P1 Gaps

### 5. Service Readiness Provenance Ambiguity

`service-readiness` returns `ready`, while `docs/SERVICE_STRATEGY_REVIEW.md` still says the service is not fully field-backed and needs real external maintainer evidence.

This can be legitimate if `ready` means local packaged CLI service workflow readiness, but the status name is too broad.

Required fix:

- Add an additive `provenance` field without changing the existing `status` enum:
  - `local-evidence-ready`
  - `sample-backed-ready`
  - `field-backed-ready`
- Keep adoption claims explicitly outside the gate until real public usage evidence exists.

Acceptance:

```bash
bun bin/boulder.ts service-readiness --cwd . --json
```

JSON must keep the existing `status` contract and distinguish local/sample evidence from field-backed external adoption evidence through the additive `provenance` field.

### 6. Handoff Defaults Are Adapter-First, Not Profile/Lane-First

`handoff packet` defaults to `gajae-code`, regardless of active profile or intended lane.

Risk:

- Research or docs workflows can accidentally generate a programming planner handoff.
- The user has to know adapter names instead of selecting lane intent.

Required fix:

- Add later `handoff packet --lane plan|execute|critic|verify` or make default adapter resolve from active profile.
- Preserve `--adapter` as explicit override.
- Keep raw workspace protection unchanged.

Acceptance:

```bash
bun bin/boulder.ts profile use research-corpus --cwd <temp>
bun bin/boulder.ts handoff packet --cwd <temp> --json
```

Default packet should either resolve from the active profile or warn that explicit adapter selection is required.

### 7. Readiness Gates Are Too String-Based

`product-readiness` and `service-readiness` primarily check whether docs contain terms. That is useful, but it can pass stale or hand-written evidence.

Required fix:

- Introduce structured evidence manifests incrementally, starting with release evidence before broadening the gate model:
  - release evidence
  - service field evidence
  - public claim evidence
- Keep string checks as smoke tests, not final truth.

Acceptance:

Readiness gates should cite structured JSON evidence for release/service proof and use docs as presentation, not source of truth. The first implementation slice should cover release evidence only unless service/public manifests are already trivial after that change.

### 8. Generated Docs Can Drift From Current CLI Behavior

Several docs are generated or evidence-like, but there is no single command that checks:

- README command examples exist in help
- docs do not mention removed commands
- release docs match package/CLI version
- skill docs match packaged files

Required fix:

- Add a docs contract check or extend `source-cleanliness`.
- Do not overbuild a linter. A small test with explicit allowed terms is enough.

Acceptance:

```bash
bun test test/source-cleanliness.test.ts
```

The test must catch:

- stale package versions
- hardcoded local skill paths
- docs claiming packaged skills that are not in `package.json.files`
- help/docs command mismatch for core commands

## P2 Gaps

### 9. Field Evidence Exists But External Adoption Is Still Not Productized

The repo has field evidence folders and metric templates, but the workflow for turning a real external user run into a public case study is still manual.

Future fix:

- Add `boulder record field-readiness` templates for:
  - first external run
  - same-maintainer second run
  - public issue/PR/release artifact
- Keep hosted dashboards out of scope.

### 10. Examples Are Static, Not Replay-Refreshed

The example repos under `examples/` have exported Boulder docs, but no obvious single gate proves they were refreshed after the latest command/version changes.

Future fix:

- Add a small replay refresh check for examples.
- Do not regenerate every example on every command.

## Execution Order

### Next Product Remediation Slice

1. Packaged Codex skill distribution gap
2. Release-check next command drift
3. Quickstart/bootstrap first-run route coherence
4. Bootstrap recommendation-to-command parity

These four are the next practical batch because they affect external users immediately and require small, testable changes.

### Later Batch

5. Service readiness provenance
6. Handoff profile/lane defaults
7. Structured readiness evidence manifests
8. Docs contract/source-cleanliness expansion
9. Capability lifecycle implementation plan converted from `plans/boulder-capability-lifecycle-gap-audit.md`

### Roadmap Batch

10. Field evidence external adoption packaging
11. Example replay refresh gate

## Must Not Do

- Do not add automatic installs.
- Do not add external model calls.
- Do not run npm publish, create tags, or create GitHub releases.
- Do not change readiness scores by prose only.
- Do not rewrite existing plans or historical evidence unless a gate requires a current-facing correction.

## Definition Of Done For This Planning Slice

- This document exists in `plans/`.
- It clearly excludes the separate capability lifecycle work.
- Every P0 gap points to observed CLI/docs/source behavior.
- Every proposed next step has a command-verifiable acceptance criterion.
