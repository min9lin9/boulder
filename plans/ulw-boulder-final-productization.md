# Boulder Final Productization

## TL;DR
> Summary:      Finish Boulder as an honest, repeatable OSS productization slice by aligning release evidence, clarifying local Codex setup, adding adapter dry-run support, refreshing replay evidence, reducing README surface area, and cleaning slop only after behavior is locked.
> Deliverables:
> - Release/check gates that align `package.json`, CLI version, changelog, README, npm/pack evidence, CI evidence, and tag evidence without publishing or tagging automatically.
> - Clear local Codex skill/onboarding guidance that distinguishes configured adapter preferences from installed/live adapters.
> - Approval-gated handoff send dry-run output that lists candidate adapter commands and proves external execution is skipped.
> - Public external replay fixtures/transcripts/readiness gates refreshed around official-docs-first evidence.
> - README reduced to install, first run, local Codex skill, core commands, public evidence, and contributor entry points.
> - Behavior-preserving slop cleanup with file-size discipline and full automated/manual QA evidence.
> Effort:       Large
> Risk:         Medium - release/readiness/docs/code surfaces are already interdependent and some evidence is stale or partially ahead of implementation.

## Scope
### Must have
- Treat Boulder repo root as `/Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder`.
- Preserve Boulder identity as a CLI/operator harness, not a hosted service or autonomous external runtime.
- Use the existing Bun/TypeScript stack from `package.json:11-17` and `tsconfig.json:1-10`.
- Follow test-first execution for every production or docs-contract change: write the named test, capture RED, implement, capture GREEN.
- Align version evidence across:
  - `package.json:2-17`
  - `src/cli.ts:26-33`
  - `CHANGELOG.md:3-11`
  - `README.md:7-15`
  - `docs/RELEASE_WORKFLOW.md:29-41`
  - `docs/CODEX_OSS_FINAL_AUDIT.md:31-46`
  - `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt:1-91`
  - `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt:1-28`
  - `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt:1-21`
- Make release gates honest: if `v0.1.14` or published npm evidence is not present, the gate must report the missing evidence rather than imply it.
- Add `handoff send --dry-run` behavior that uses adapter command metadata from `src/executor-adapters.ts:3-34` but does not execute external commands.
- Keep live adapter support approval-gated: approved live handoff may prepare and print a maintainer-run command/runbook, but must not spawn GJC, LazyCodex, package installers, provider SDKs, or external processes automatically.
- Refresh local Codex skill docs and onboarding around wrapper usage and command order:
  - `skills/boulder/SKILL.md:18-68`
  - `skills/boulder/references/usage.ko.md:27-45`
  - `docs/BOULDER_CODEX_SKILL_USAGE.ko.md:36-62`
  - `docs/ONBOARDING.md:5-33`
- Refresh external replay docs/fixtures/transcripts around official-docs-first evidence:
  - `docs/EXTERNAL_REPLAY.md:1-31`
  - `docs/CASE_STUDIES/external-replay.md:1-23`
  - `fixtures/replay/*/replay.json`
  - `fixtures/replay/*/official-docs.json`
  - `docs/CASE_STUDIES/evidence/external-replay/*.txt`
- Keep every edited source file at or below 250 pure LOC. Current high-risk files based on exploration: `src/service-readiness.ts` 240, `src/workflow-profiles.ts` 238, `src/cli.ts` 228, `src/handoff-command.ts` 224, `src/capability-doctor.ts` 221, `src/handoff-paths.ts` 216, `src/scorecard.ts` 213, `src/handoff-packet.ts` 204.
- Preserve current package include policy in `package.json:28-41`, especially exclusion of duplicate copy artifacts.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not run `npm publish`, `git tag`, `git push`, or `gh release create` automatically. Those remain maintainer actions unless a separate explicit approval is given outside this plan.
- Do not fake public evidence. If only candidate tarball evidence exists, label it candidate evidence and keep public publish/tag readiness blocked or pending.
- Do not claim OpenAI acceptance, external adoption, hosted service availability, runtime scale, benchmark leadership, Codex Security access, autonomous provider execution, or credential access.
- Do not convert Boulder into a launcher, daemon, adapter runtime, credential manager, package installer, or isolated-home manager.
- Do not add provider SDK dependencies, network calls, process spawning for external adapters, or credentials.
- Do not broaden README into a product essay, command encyclopedia, benchmark narrative, or application packet; move detail to docs.
- Do not edit `vendor/`, `node_modules/`, generated caches, or `.git`. Use `plans/ulw-evidence/` for this run's QA ledger. Whether tracked or untracked, it must match the final notepad.

- Do not push files over the 250 pure-LOC rule; split by responsibility first if a touched source file would cross the line.
- Do not suppress tests, skip tests, add `.only`, add `.skip`, add `xfail`, or loosen assertions to pass.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Bun test runner (`bun test`) and TypeScript typecheck (`./node_modules/.bin/tsc --noEmit`).
- QA policy: every task has agent-executed scenarios through tmux or bash. No browser QA is required because Boulder surfaces are CLI/docs/data, and the local browser policy forbids non-Codex browser substitution.
- Evidence: `plans/ulw-evidence/<slug>.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: Release, tag, publish-evidence alignment
- Task 2: Local Codex skill and onboarding clarity
- Task 3: Handoff adapter dry-run and live-runbook support
- Task 4: External replay fixture/transcript evidence refresh
- Task 5: README diet and public navigation contract

Wave 2 (after Wave 1):
- Task 6: Readiness gates consume aligned release/replay evidence; depends [1, 4]
- Task 7: Behavior-preserving slop cleanup and file-size discipline; depends [1, 2, 3, 4, 5]
- Task 8: Package, CI, and release evidence capture refresh; depends [1, 5]

Wave 3 (after Wave 2):
- Task 9: Full regression, generated docs consistency, and final evidence ledger; depends [6, 7, 8]

Critical path: Task 1 -> Task 6 -> Task 9

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1    | none       | 6, 8   | 2, 3, 4, 5           |
| 2    | none       | 7      | 1, 3, 4, 5           |
| 3    | none       | 7      | 1, 2, 4, 5           |
| 4    | none       | 6, 7   | 1, 2, 3, 5           |
| 5    | none       | 7, 8   | 1, 2, 3, 4           |
| 6    | 1, 4       | 9      | 7, 8                 |
| 7    | 1, 2, 3, 4, 5 | 9   | 6, 8                 |
| 8    | 1, 5       | 9      | 6, 7                 |
| 9    | 6, 7, 8    | final  | none                 |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Release, Tag, Publish-Evidence Alignment

  What to do: Add release-check tests first for version/evidence alignment, then update `src/release-check.ts` and release-facing docs/evidence so Boulder distinguishes candidate package evidence from public publish/tag evidence. The release report must compare package version, CLI version, changelog heading, README release line, pack dry-run version, install-smoke version, GitHub Actions evidence, and local tag evidence. If the current repo lacks `v0.1.14` or published `0.1.14` evidence, report the exact missing evidence and keep next commands explicit.
  Must NOT do: Do not publish to npm, create tags, push tags, create GitHub Releases, or edit evidence to claim a public result that did not happen.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [6, 8] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/release-check.ts:18-37` - current release-check evaluator and next-command shape to extend without side effects.
  - Pattern:  `src/release-check.ts:60-83` - current content check and JSON parsing helper style.
  - Pattern:  `src/cli.ts:141-150` - release-check command wiring and exit-code behavior.
  - Pattern:  `src/cli.ts:26-33` - CLI version constant that must match package version.
  - Pattern:  `package.json:2-17` - package name/version/scripts source of truth.
  - Pattern:  `package.json:28-41` - package file include/exclude policy.
  - Pattern:  `.github/workflows/ci.yml:20-29` - CI Bun version and `bun run ci` gate.
  - Pattern:  `README.md:7-15` - current release candidate and install smoke wording.
  - Pattern:  `CHANGELOG.md:3-11` - current version heading.
  - Pattern:  `docs/RELEASE_WORKFLOW.md:29-41` - required release alignment and current stale note.
  - Pattern:  `docs/CODEX_OSS_FINAL_AUDIT.md:31-46` - stale hard-gate/version statements to make honest.
  - Pattern:  `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt:1-91` - candidate/public install smoke evidence to parse.
  - Pattern:  `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt:1-28` - CI evidence format.
  - Pattern:  `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt:1-21` - pack dry-run version and inventory evidence.
  - Test:     `test/readiness-reports.test.ts:52-75` - existing release-plan/release-check assertions; rewrite/add tests here.
  - Test:     `test/cli-e2e.test.ts:74-83` - CLI release-check JSON e2e shape.
  - External: `https://docs.npmjs.com/cli/v11/commands/npm-publish/` - npm publish is one-time per name/version and supports `--dry-run`; use for docs wording only.
  - External: `https://docs.npmjs.com/cli/v11/commands/npm-pack/` - package inclusion/dry-run reference.
  - External: `https://git-scm.com/book/en/v2/Git-Basics-Tagging` - tag semantics.
  - External: `https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository` - GitHub Release/tag workflow.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test ./test/readiness-reports.test.ts --test-name-pattern "release-check aligns package cli changelog readme tag and publish evidence"` fails before source/docs changes with a meaningful missing-check or stale-version assertion; save output to `plans/ulw-evidence/task-1-release-alignment-red.txt`.
  - [ ] GREEN proof captured: the same command passes after implementation; save output to `plans/ulw-evidence/task-1-release-alignment-green.txt`.
  - [ ] `bun test ./test/cli-e2e.test.ts --test-name-pattern "renders release-check evidence without publishing"` passes and asserts release-check does not publish/tag/create releases.
  - [ ] `bun bin/boulder.ts release-check --cwd . --json` emits JSON with check ids for `package-json`, `cli-version`, `changelog-version`, `readme-version`, `ci-bun-engine`, `pack-dry-run-evidence`, `install-smoke-version`, `git-tag-local`, and `github-actions-evidence`.
  - [ ] `git tag --list "v$(node -p "require('./package.json').version")"` is used only as evidence input; no tag is created by Boulder.
  - [ ] Stale `0.1.7`/`0.1.11` text in release-final docs is either updated to a clearly labeled historical baseline or moved out of current readiness claims.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: release check reports honest aligned evidence
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-release-check 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts release-check --cwd . --json; printf "\nEXIT:$?\n"'; sleep 1; tmux capture-pane -pt ulw-qa-release-check -S -200 > plans/ulw-evidence/task-1-release-check.txt; tmux kill-session -t ulw-qa-release-check
    Expected: plans/ulw-evidence/task-1-release-check.txt contains a JSON object, contains "version": "0.1.14", contains all required release check ids, and contains no claim that Boulder published, tagged, pushed, or created a GitHub Release.
    Evidence: plans/ulw-evidence/task-1-release-check.txt

  Scenario: stale release fixture blocks instead of claiming ready
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-release-stale 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && tmpdir=$(mktemp -d); cp -R package.json src CHANGELOG.md README.md docs .github "$tmpdir"/; sed -i.bak "s/0.1.14/9.9.9/g" "$tmpdir/docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"; bun bin/boulder.ts release-check --cwd "$tmpdir" --json; code=$?; rm -rf "$tmpdir"; printf "\nEXIT:$code\n"'; sleep 1; tmux capture-pane -pt ulw-qa-release-stale -S -240 > plans/ulw-evidence/task-1-release-stale-error.txt; tmux kill-session -t ulw-qa-release-stale
    Expected: plans/ulw-evidence/task-1-release-stale-error.txt contains "status": "blocked" or an equivalent failing release status, identifies the install-smoke version mismatch, and exits non-zero if required public evidence is missing.
    Evidence: plans/ulw-evidence/task-1-release-stale-error.txt
  ```

  Commit: YES | Message: `fix(release): align release evidence gates` | Files: [`src/release-check.ts`, `test/readiness-reports.test.ts`, `test/cli-e2e.test.ts`, `docs/RELEASE_WORKFLOW.md`, `docs/CODEX_OSS_FINAL_AUDIT.md`, `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt`, `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt`, `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt`]

- [ ] 2. Local Codex Skill And Onboarding Clarity

  What to do: Add tests first that pin quickstart/onboard/doctor wording and local skill setup behavior, then update CLI output/docs/skill docs so users understand that GJC and LazyCodex are configured preferences, not installed dependencies, and that live adapter commands require explicit approval. Keep wrapper command order unambiguous: Boulder command first, `--cwd` after the command.
  Must NOT do: Do not imply `bunx` is the default local Codex path, do not imply GJC/LazyCodex are installed, and do not auto-run live adapters.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [7] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/quickstart.ts:24-60` - first-run command sequence.
  - Pattern:  `src/quickstart.ts:62-81` - quickstart checks from resolved workflow profile.
  - Pattern:  `src/quickstart.ts:84-107` - current human quickstart copy.
  - Pattern:  `src/quickstart.ts:117-123` - executor check evidence shape.
  - Pattern:  `src/capability-doctor.ts` - doctor source; inspect before editing because it is 221 pure LOC and near the size ceiling.
  - Pattern:  `src/cli-format.ts:48-64` - human doctor report format.
  - Pattern:  `skills/boulder/SKILL.md:18-68` - local wrapper and default workflow.
  - Pattern:  `skills/boulder/references/usage.ko.md:27-45` - Korean local execution guidance.
  - Pattern:  `docs/BOULDER_CODEX_SKILL_USAGE.ko.md:36-62` - user-facing skill explanation.
  - Pattern:  `docs/ONBOARDING.md:5-33` - pre/post-publish onboarding path.
  - Test:     `test/readiness-reports.test.ts:78-95` - quickstart report assertions.
  - Test:     `test/cli-e2e.test.ts:54-72` - CLI quickstart/onboard e2e.
  - Test:     `test/cli-e2e.test.ts:171-216` - doctor JSON/human output assertions.
  - API/Type: `src/types.ts:14-30` - executor modes and adapter command metadata types.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test ./test/cli-e2e.test.ts --test-name-pattern "renders first-run quickstart and onboard surfaces"` fails before changes on the new adapter clarity assertions; save to `plans/ulw-evidence/task-2-codex-onboarding-red.txt`.
  - [ ] GREEN proof captured: the same command passes after changes; save to `plans/ulw-evidence/task-2-codex-onboarding-green.txt`.
  - [ ] `bun test ./test/readiness-reports.test.ts --test-name-pattern "summarizes the next first-run commands for a repository"` passes and asserts `plan=gajae-code`, `execute=lazycodex`, `configured-unverified`, `approval-gated`, and local `doctor` wording.
  - [ ] `bun test ./test/cli-e2e.test.ts --test-name-pattern "renders capability doctor json for installed Codex tools"` still passes.
  - [ ] Docs contain the correct wrapper shape and do not contain the discouraged ordering as the primary instruction: `rg -n "boulder-local.sh --cwd .* inspect|bunx boulder-oss-cli.*local Codex default" skills/boulder docs/BOULDER_CODEX_SKILL_USAGE.ko.md docs/ONBOARDING.md` returns no primary-path hits.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: new repo quickstart names configured adapters without claiming installation
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-codex-onboard 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && tmpdir=$(mktemp -d); bun bin/boulder.ts init --cwd "$tmpdir"; bun bin/boulder.ts quickstart --cwd "$tmpdir"; bun bin/boulder.ts doctor --cwd "$tmpdir"; code=$?; rm -rf "$tmpdir"; printf "\nEXIT:$code\n"'; sleep 1; tmux capture-pane -pt ulw-qa-codex-onboard -S -300 > plans/ulw-evidence/task-2-codex-onboard.txt; tmux kill-session -t ulw-qa-codex-onboard
    Expected: plans/ulw-evidence/task-2-codex-onboard.txt contains "plan=gajae-code", "execute=lazycodex", "configured-unverified", "approval-gated", and "EXIT:0".
    Evidence: plans/ulw-evidence/task-2-codex-onboard.txt

  Scenario: wrong wrapper ordering is not documented as primary path
    Tool:     bash
    Steps:    cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && { rg -n "boulder-local.sh --cwd /path/to/repo inspect" skills/boulder docs/BOULDER_CODEX_SKILL_USAGE.ko.md docs/ONBOARDING.md || true; } > plans/ulw-evidence/task-2-codex-onboard-error.txt
    Expected: plans/ulw-evidence/task-2-codex-onboard-error.txt is empty or only contains explicitly labeled "Do not call it as" examples.
    Evidence: plans/ulw-evidence/task-2-codex-onboard-error.txt
  ```

  Commit: YES | Message: `docs(skill): clarify local codex boulder setup` | Files: [`src/quickstart.ts`, `src/cli-format.ts`, `test/readiness-reports.test.ts`, `test/cli-e2e.test.ts`, `skills/boulder/SKILL.md`, `skills/boulder/references/usage.ko.md`, `docs/BOULDER_CODEX_SKILL_USAGE.ko.md`, `docs/ONBOARDING.md`]

- [ ] 3. Handoff Adapter Dry-Run And Live-Runbook Support

  What to do: Add failing tests first for `handoff send --dry-run`, then implement dry-run output for approved handoff packets. Dry-run must validate the packet, require review/approval when `--approve-external` is present, list candidate commands from `adapterCommandsForExecutor`, mark approval-required commands, and print `external execution: skipped`. Approved non-dry-run must still not spawn external adapters; it may print a maintainer-run live handoff runbook.
  Must NOT do: Do not call `bunx gajae-code`, `lazycodex`, `child_process`, provider SDKs, package installs, or any external runtime from Boulder.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [7] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/handoff-command.ts:28-44` - handoff subcommand dispatch.
  - Pattern:  `src/handoff-command.ts:102-133` - current send command, approval receipt check, and message output.
  - Pattern:  `src/handoff-command.ts:229-242` - validation/error helpers.
  - Pattern:  `src/handoff-packet.ts:124-152` - send evaluation and default block/ready semantics.
  - Pattern:  `src/executor-adapters.ts:3-34` - adapter command metadata to use for dry-run/live runbook output.
  - Pattern:  `src/types.ts:26-30` - `ExecutorAdapterCommand` contract.
  - Pattern:  `src/cli-options.ts:3-27` - `dryRun` option already parsed globally.
  - Pattern:  `src/cli-format.ts:24-26` - help text missing `--dry-run` on handoff send.
  - Test:     `test/handoff-cli-e2e.test.ts:103-152` - review/approved-send/dry-run e2e coverage.
  - Test:     `test/handoff-packet.test.ts` - packet safety unit tests; add dry-run/runbook unit tests if command output is factored out of CLI.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test ./test/handoff-cli-e2e.test.ts --test-name-pattern "renders approved handoff send dry-run without external execution"` fails before implementation; save to `plans/ulw-evidence/task-3-handoff-dry-run-red.txt`.
  - [ ] GREEN proof captured: the same command passes after implementation; save to `plans/ulw-evidence/task-3-handoff-dry-run-green.txt`.
  - [ ] `bun test ./test/handoff-cli-e2e.test.ts --test-name-pattern "blocks external handoff send by default"` still passes.
  - [ ] `bun test ./test/handoff-cli-e2e.test.ts --test-name-pattern "requires review before approved external send"` still passes.
  - [ ] `bun bin/boulder.ts --help` includes `boulder handoff send [--cwd path] [--packet path] [--approve-external] [--approval-code code] [--dry-run]`.
  - [ ] Static side-effect search proves no external process launch was introduced: `rg -n "child_process|spawn\\(|exec\\(|Bun\\.spawn|Bun\\.spawnSync|bunx gajae-code|lazycodex run" src` returns no new launcher code except string metadata in `src/executor-adapters.ts`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: approved dry-run prints adapter command and skips execution
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-handoff-dry-run 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && tmpdir=$(mktemp -d); bun bin/boulder.ts handoff packet --cwd "$tmpdir" --adapter gajae-code; review=$(bun bin/boulder.ts handoff review --cwd "$tmpdir" --adapter gajae-code); code=$(printf "%s\n" "$review" | sed -n "s/^- approval-code: //p"); bun bin/boulder.ts handoff send --cwd "$tmpdir" --adapter gajae-code --approve-external --approval-code "$code" --dry-run; status=$?; rm -rf "$tmpdir"; printf "\nEXIT:$status\n"'; sleep 1; tmux capture-pane -pt ulw-qa-handoff-dry-run -S -300 > plans/ulw-evidence/task-3-handoff-dry-run.txt; tmux kill-session -t ulw-qa-handoff-dry-run
    Expected: plans/ulw-evidence/task-3-handoff-dry-run.txt contains "Boulder handoff send dry-run", "adapter: gajae-code", "command: bunx gajae-code", "external execution: skipped", and "EXIT:0".
    Evidence: plans/ulw-evidence/task-3-handoff-dry-run.txt

  Scenario: dry-run still fails closed without a review receipt
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-handoff-dry-run-error 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && tmpdir=$(mktemp -d); bun bin/boulder.ts handoff packet --cwd "$tmpdir" --adapter gajae-code >/dev/null; bun bin/boulder.ts handoff send --cwd "$tmpdir" --adapter gajae-code --approve-external --dry-run; status=$?; rm -rf "$tmpdir"; printf "\nEXIT:$status\n"'; sleep 1; tmux capture-pane -pt ulw-qa-handoff-dry-run-error -S -200 > plans/ulw-evidence/task-3-handoff-dry-run-error.txt; tmux kill-session -t ulw-qa-handoff-dry-run-error
    Expected: plans/ulw-evidence/task-3-handoff-dry-run-error.txt contains "ERROR handoff.review_required" and "EXIT:1".
    Evidence: plans/ulw-evidence/task-3-handoff-dry-run-error.txt
  ```

  Commit: YES | Message: `feat(handoff): add approved adapter dry-run output` | Files: [`src/handoff-command.ts`, `src/handoff-packet.ts`, `src/executor-adapters.ts`, `src/cli-format.ts`, `test/handoff-cli-e2e.test.ts`, `test/handoff-packet.test.ts`]

- [ ] 4. External Replay Fixture And Transcript Evidence Refresh

  What to do: Add tests first that require replay fixtures/transcripts to include official-docs-first evidence, active profile/adapter preference output, dry-run-only runbooks, expected artifacts, and explicit limitations. Then refresh replay fixtures and transcripts so `replay-check`, `replay-run --dry-run`, `service-readiness`, and public case-study docs agree.
  Must NOT do: Do not clone public repositories, install target dependencies, mutate upstream repositories, or claim external adoption.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [6, 7] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/replay-check.ts:47-66` - replay check root traversal.
  - Pattern:  `src/replay-check.ts:90-130` - project fixture validation and evidence path checks.
  - Pattern:  `src/replay-check.ts:132-180` - replay and official-docs shape/policy.
  - Pattern:  `src/replay-run.ts:30-62` - dry-run-only replay runbook builder.
  - Pattern:  `src/replay-run.ts:64-87` - replay runbook markdown output.
  - Pattern:  `src/service-readiness.ts:111-149` - official docs and replay manifest readiness checks.
  - Pattern:  `docs/EXTERNAL_REPLAY.md:1-31` - replay rule and evidence checklist.
  - Pattern:  `docs/CASE_STUDIES/external-replay.md:1-23` - public case study index.
  - Pattern:  `fixtures/replay/awesome-codex-subagents/replay.json:1-24` - public replay fixture shape.
  - Pattern:  `fixtures/replay/gajae-code/replay.json:1-24` - public replay fixture shape.
  - Pattern:  `fixtures/replay/kimi-agent-swarm-skill/replay.json:1-23` - local/candidate replay command drift to normalize.
  - Pattern:  `fixtures/replay/*/official-docs.json` - official-docs-first source fixtures.
  - Pattern:  `docs/CASE_STUDIES/evidence/external-replay/*.txt` - transcripts currently missing newer quickstart adapter/profile lines.
  - Test:     `test/readiness-reports.test.ts:97-118` - replay-check and replay-run report assertions.
  - Test:     `test/service-readiness.test.ts:141-150` - blocks missing official docs.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test ./test/readiness-reports.test.ts --test-name-pattern "checks public replay fixtures and official docs references"` fails before transcript/fixture refresh on the new active-profile/adapter/evidence assertion; save to `plans/ulw-evidence/task-4-replay-evidence-red.txt`.
  - [ ] GREEN proof captured: the same command passes after changes; save to `plans/ulw-evidence/task-4-replay-evidence-green.txt`.
  - [ ] `bun test ./test/readiness-reports.test.ts --test-name-pattern "builds a dry-run command plan from replay fixtures"` passes and asserts every project is `dryRunOnly: true`, every evidence path stays under `docs/CASE_STUDIES/evidence/external-replay/`, and every command uses Boulder public/local candidate surfaces consistently.
  - [ ] `bun test ./test/service-readiness.test.ts --test-name-pattern "blocks when official documentation evidence is missing for public OSS replay"` still passes.
  - [ ] `bun bin/boulder.ts replay-check --cwd . --json` returns `status: ready` when fixtures/transcripts are valid.
  - [ ] `bun bin/boulder.ts replay-run --cwd . --dry-run --json` returns `status: ready`, does not execute commands, and includes every replay project.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: replay check validates all public fixtures
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-replay-check 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts replay-check --cwd . --json; printf "\nEXIT:$?\n"'; sleep 1; tmux capture-pane -pt ulw-qa-replay-check -S -240 > plans/ulw-evidence/task-4-replay-check.txt; tmux kill-session -t ulw-qa-replay-check
    Expected: plans/ulw-evidence/task-4-replay-check.txt contains "status": "ready", "gajae-code", "awesome-codex-subagents", "kimi-agent-swarm-skill", "official-docs-first", and "EXIT:0".
    Evidence: plans/ulw-evidence/task-4-replay-check.txt

  Scenario: invalid replay docs path blocks
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-replay-error 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && tmpdir=$(mktemp -d); cp -R fixtures docs package.json src "$tmpdir"/; sed -i.bak "s#fixtures/replay/gajae-code/official-docs.json#fixtures/replay/gajae-code/missing-docs.json#" "$tmpdir/fixtures/replay/gajae-code/replay.json"; bun bin/boulder.ts replay-check --cwd "$tmpdir" --json; code=$?; rm -rf "$tmpdir"; printf "\nEXIT:$code\n"'; sleep 1; tmux capture-pane -pt ulw-qa-replay-error -S -240 > plans/ulw-evidence/task-4-replay-check-error.txt; tmux kill-session -t ulw-qa-replay-error
    Expected: plans/ulw-evidence/task-4-replay-check-error.txt contains "status": "blocked" or failing replay status, identifies "officialDocsPath", and exits non-zero.
    Evidence: plans/ulw-evidence/task-4-replay-check-error.txt
  ```

  Commit: YES | Message: `docs(replay): refresh external replay evidence` | Files: [`src/replay-check.ts`, `src/replay-run.ts`, `test/readiness-reports.test.ts`, `test/service-readiness.test.ts`, `docs/EXTERNAL_REPLAY.md`, `docs/CASE_STUDIES/external-replay.md`, `fixtures/replay/*/replay.json`, `fixtures/replay/*/official-docs.json`, `docs/CASE_STUDIES/evidence/external-replay/*.txt`]

- [ ] 5. README Diet And Public Navigation Contract

  What to do: Add a docs contract test first, then reduce `README.md` to a compact public quickstart and evidence index. Keep install, first run, local Codex skill, core commands, public evidence, and contributor pointers. Move or preserve detailed command narratives in docs rather than the README.
  Must NOT do: Do not remove essential install/first-run commands, package name, local Codex skill guidance, evidence links, or limitation claims.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [7, 8] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `README.md:1-15` - product definition and release/install intro.
  - Pattern:  `README.md:25-46` - first-run/core higher-friction commands.
  - Pattern:  `README.md:48-74` - local Codex skill guidance to preserve.
  - Pattern:  `README.md:76-100` - current large command list to compress.
  - Pattern:  `README.md:102-114` - generated artifact list and workflow profile fallback.
  - Pattern:  `README.md:116-131` - why/evidence links and limitation statement.
  - Pattern:  `README.md:133-149` - contributor and more-docs link list.
  - Pattern:  `docs/ONBOARDING.md:5-33` - target home for detailed command path.
  - Pattern:  `docs/CONTRIBUTOR_START_HERE.md` - contributor entrypoint.
  - Pattern:  `docs/CASE_STUDIES/README.md` - public evidence index.
  - Test:     Add `test/docs-contract.test.ts` or extend `test/readiness-reports.test.ts` with README assertions.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test ./test/docs-contract.test.ts --test-name-pattern "README stays compact while preserving public quickstart"` fails before README changes; save to `plans/ulw-evidence/task-5-readme-diet-red.txt`.
  - [ ] GREEN proof captured: the same command passes after changes; save to `plans/ulw-evidence/task-5-readme-diet-green.txt`.
  - [ ] `wc -l README.md` returns `120` or fewer lines.
  - [ ] `README.md` contains `bunx boulder-oss-cli@latest --help`, `boulder quickstart`, `boulder doctor`, `boulder release-check`, `boulder replay-check`, `boulder product-readiness`, `boulder service-readiness`, `docs/CASE_STUDIES/external-replay.md`, and `docs/BOULDER_CODEX_SKILL_USAGE.ko.md`.
  - [ ] `README.md` contains limitation text equivalent to "not a hosted service" and "does not auto-run external adapters".
  - [ ] `README.md` does not contain stale published-version claims for versions other than the current package version unless labeled as historical baseline.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: README remains compact and navigable
    Tool:     bash
    Steps:    cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && { wc -l README.md; rg -n "bunx boulder-oss-cli@latest --help|boulder quickstart|boulder doctor|release-check|replay-check|product-readiness|service-readiness|not hosted|external adapter" README.md; } > plans/ulw-evidence/task-5-readme-diet.txt
    Expected: plans/ulw-evidence/task-5-readme-diet.txt first line has a line count <= 120 and all required terms have at least one match.
    Evidence: plans/ulw-evidence/task-5-readme-diet.txt

  Scenario: README has no stale current-version claim
    Tool:     bash
    Steps:    cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && node -e 'const fs=require("fs"); const pkg=require("./package.json"); const readme=fs.readFileSync("README.md","utf8"); const stale=[...readme.matchAll(/0\\.1\\.(?:7|8|9|10|11|12|13)/g)].map(m=>m[0]); if (stale.length) { console.error(`stale current-version claim: ${stale.join(",")}`); process.exit(1); } if (!readme.includes(pkg.version)) process.exit(2);' > plans/ulw-evidence/task-5-readme-diet-error.txt 2>&1
    Expected: command exits 0 and plans/ulw-evidence/task-5-readme-diet-error.txt is empty.
    Evidence: plans/ulw-evidence/task-5-readme-diet-error.txt
  ```

  Commit: YES | Message: `docs(readme): compact product quickstart` | Files: [`README.md`, `docs/ONBOARDING.md`, `test/docs-contract.test.ts`]

- [ ] 6. Readiness Gates Consume Release And Replay Evidence

  What to do: After Tasks 1 and 4, add tests first that product/service readiness consume the strengthened release/replay evidence. Update `src/product-readiness.ts`, `src/service-readiness.ts`, and generated readiness docs so readiness status is honest: local/candidate-ready can pass candidate evidence, but public product-ready requires published install smoke and tag/release evidence matching package version.
  Must NOT do: Do not reduce readiness checks to prose caveats; failed evidence must be a failing check.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [9] | Blocked by: [1, 4]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/product-readiness.ts:24-98` - current product readiness evidence gates.
  - Pattern:  `src/product-readiness.ts:117-150` - content/file/release-tree check helpers.
  - Pattern:  `src/service-readiness.ts:41-80` - service readiness aggregation and product readiness dependency.
  - Pattern:  `src/service-readiness.ts:111-149` - official docs/replay checks.
  - Pattern:  `src/service-field-evidence.ts` - field evidence gate used by service readiness.
  - Pattern:  `fixtures/service-readiness/gates.json` - service acceptance gate fixture.
  - Pattern:  `docs/PRODUCT_READINESS.md` - generated/readiness evidence output target.
  - Pattern:  `docs/SERVICE_READINESS.md` - generated/readiness evidence output target.
  - Test:     `test/product-readiness.test.ts:17-41` - ready fixture setup to extend with aligned release evidence.
  - Test:     `test/product-readiness.test.ts:54-74` - blocking install smoke and duplicate artifact tests.
  - Test:     `test/service-readiness.test.ts:110-197` - service readiness pass/block scenarios.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test ./test/product-readiness.test.ts --test-name-pattern "blocks when release tag or published install evidence does not match package version"` fails before implementation; save to `plans/ulw-evidence/task-6-readiness-red.txt`.
  - [ ] GREEN proof captured: the same command passes after implementation; save to `plans/ulw-evidence/task-6-readiness-green.txt`.
  - [ ] `bun test ./test/service-readiness.test.ts` passes.
  - [ ] `bun bin/boulder.ts product-readiness --cwd . --json` emits check ids for release evidence and does not claim public readiness if the current package version is not published/tagged in evidence.
  - [ ] `bun bin/boulder.ts service-readiness --cwd . --json` preserves `ready`, `pilot-ready`, or `blocked` semantics from `src/service-readiness.ts:71-74`.
  - [ ] Generated `docs/PRODUCT_READINESS.md` and `docs/SERVICE_READINESS.md` reflect the CLI JSON status from the same commit.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: product and service readiness report honest current status
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-readiness 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts product-readiness --cwd . --json; printf "\n--- service ---\n"; bun bin/boulder.ts service-readiness --cwd . --json; printf "\nEXIT:$?\n"'; sleep 1; tmux capture-pane -pt ulw-qa-readiness -S -320 > plans/ulw-evidence/task-6-readiness.txt; tmux kill-session -t ulw-qa-readiness
    Expected: plans/ulw-evidence/task-6-readiness.txt contains product and service JSON, includes release/replay/field-evidence check ids, and contains no unsupported public adoption or OpenAI acceptance claim.
    Evidence: plans/ulw-evidence/task-6-readiness.txt

  Scenario: mismatched public install smoke blocks product readiness
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-readiness-error 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && tmpdir=$(mktemp -d); cp -R package.json src docs fixtures .github SECURITY.md "$tmpdir"/; sed -i.bak "s/0.1.14/0.0.0/g" "$tmpdir/docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt"; bun bin/boulder.ts product-readiness --cwd "$tmpdir" --json; code=$?; rm -rf "$tmpdir"; printf "\nEXIT:$code\n"'; sleep 1; tmux capture-pane -pt ulw-qa-readiness-error -S -260 > plans/ulw-evidence/task-6-readiness-error.txt; tmux kill-session -t ulw-qa-readiness-error
    Expected: plans/ulw-evidence/task-6-readiness-error.txt contains "blocked", identifies the install-smoke or release evidence mismatch, and exits non-zero.
    Evidence: plans/ulw-evidence/task-6-readiness-error.txt
  ```

  Commit: YES | Message: `fix(readiness): gate public readiness on aligned evidence` | Files: [`src/product-readiness.ts`, `src/service-readiness.ts`, `test/product-readiness.test.ts`, `test/service-readiness.test.ts`, `docs/PRODUCT_READINESS.md`, `docs/SERVICE_READINESS.md`, `fixtures/service-readiness/gates.json`]

- [ ] 7. Behavior-Preserving Slop Cleanup And File-Size Discipline

  What to do: After feature/doc surfaces stabilize, inspect the changed file list and run a slop pass scoped only to files touched by Tasks 1-6. Before any cleanup, add or reuse characterization tests that lock observable behavior. Remove obvious comments, dead code, redundant defensive branches, duplicated helpers, stale docs wording, and needless abstractions only when behavior equivalence is clear. If any touched source file exceeds or would exceed 250 pure LOC, split it by responsibility before further changes.
  Must NOT do: Do not refactor manifest parser, benchmark parser, release-plan scoring, or command registry unless a changed task already touched them and tests lock behavior. Do not introduce new abstractions, new dependencies, public API changes, or broad rewrites.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [9] | Blocked by: [1, 2, 3, 4, 5]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `plans/ulw-slop-reduction-plan.md:6-23` - previous narrow slop scope and out-of-scope guardrails.
  - Pattern:  `plans/ulw-slop-reduction-plan.md:24-45` - previous behavior-lock, cleanup, verification waves.
  - Pattern:  `src/cli.ts:28-230` - command registry is near 250 pure LOC; avoid expanding it, extract only if necessary.
  - Pattern:  `src/handoff-command.ts:28-133` - handoff command may grow in Task 3; split formatter/runbook if needed.
  - Pattern:  `src/service-readiness.ts:41-80` and `src/service-readiness.ts:99-259` - service readiness near ceiling; split checks only if Task 6 pushes it over.
  - Pattern:  `src/product-readiness.ts:24-98` and `src/product-readiness.ts:117-182` - product readiness checks/helper pattern.
  - Test:     `test/cli-e2e.test.ts:27-52` - init/validate/scorecard/export characterization.
  - Test:     `test/handoff-cli-e2e.test.ts:4-214` - handoff behavior safety suite.
  - Test:     `test/readiness-reports.test.ts:39-119` - release/replay/readiness report characterization.
  - Test:     `test/product-readiness.test.ts:43-74` - product readiness pass/block characterization.
  - Test:     `test/service-readiness.test.ts:110-197` - service readiness pass/block characterization.

  Acceptance criteria (agent-executable only):
  - [ ] Baseline characterization captured before cleanup: `bun test ./test/cli-e2e.test.ts ./test/handoff-cli-e2e.test.ts ./test/readiness-reports.test.ts ./test/product-readiness.test.ts ./test/service-readiness.test.ts` passes; save to `plans/ulw-evidence/task-7-slop-baseline-green.txt`.
  - [ ] If adding a new characterization test is necessary, RED proof for the uncovered behavior is captured before cleanup in `plans/ulw-evidence/task-7-slop-red.txt`, then GREEN in `plans/ulw-evidence/task-7-slop-green.txt`.
  - [ ] After cleanup, the same targeted suite passes and output is saved to `plans/ulw-evidence/task-7-slop-targeted-green.txt`.
  - [ ] Pure LOC check passes: `awk '!/^[[:space:]]*$/ && !/^[[:space:]]*(\\/\\/|#)/ {count[FILENAME]++} END {for (f in count) if (count[f] > 250) {print count[f], f; bad=1} exit bad}' src/*.ts bin/*.ts` exits 0.
  - [ ] Static slop search passes: `rg -n "TODO|console\\.log\\(|debugger|as any|@ts-ignore|@ts-expect-error|catch \\{\\}|catch \\([^)]*\\) \\{[[:space:]]*\\}" src test` has no new unapproved hits.
  - [ ] `git diff --stat` shows no broad unrelated refactor outside files touched by Tasks 1-6.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: cleaned CLI still exposes expected public commands
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-slop-help 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts --help; printf "\nEXIT:$?\n"'; sleep 1; tmux capture-pane -pt ulw-qa-slop-help -S -200 > plans/ulw-evidence/task-7-slop-help.txt; tmux kill-session -t ulw-qa-slop-help
    Expected: plans/ulw-evidence/task-7-slop-help.txt contains init, quickstart, doctor, handoff send, replay-run --dry-run, release-check, product-readiness, service-readiness, export, and "EXIT:0".
    Evidence: plans/ulw-evidence/task-7-slop-help.txt

  Scenario: size/slop gate rejects oversized or unsafe source
    Tool:     bash
    Steps:    cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && { awk '!/^[[:space:]]*$/ && !/^[[:space:]]*(\\/\\/|#)/ {count[FILENAME]++} END {for (f in count) print count[f], f}' src/*.ts bin/*.ts | sort -nr; rg -n "as any|@ts-ignore|@ts-expect-error|debugger|catch \\{\\}" src test || true; } > plans/ulw-evidence/task-7-slop-error.txt
    Expected: plans/ulw-evidence/task-7-slop-error.txt has no file count greater than 250 and no unsafe TypeScript escape hatch hits.
    Evidence: plans/ulw-evidence/task-7-slop-error.txt
  ```

  Commit: YES | Message: `refactor(core): remove verified productization slop` | Files: [`src/**`, `test/**`, docs touched by Tasks 1-6 only]

- [ ] 8. Package, CI, And Release Evidence Capture Refresh

  What to do: Add/extend tests first for package dry-run evidence and release workflow docs, then regenerate/capture package dry-run and local CI evidence after Tasks 1 and 5. Update release evidence files so they name the exact command, date, package version, entry count, and known limitations.
  Must NOT do: Do not run networked npm publish, push tags, or create releases. If `npm pack --dry-run` needs a cache, use `/private/tmp/boulder-npm-cache` or another temp path and clean it after capture.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [9] | Blocked by: [1, 5]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `package.json:11-17` - `ci`, `smoke`, `build`, and package dry-run scripts.
  - Pattern:  `package.json:28-41` - package include list and duplicate-copy exclusion.
  - Pattern:  `.github/workflows/ci.yml:1-29` - public CI gate.
  - Pattern:  `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt:1-21` - pack dry-run evidence format.
  - Pattern:  `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt:1-28` - CI evidence format.
  - Pattern:  `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt:28-91` - candidate tarball smoke format.
  - Test:     `test/cli-e2e.test.ts:17-25` - duplicate copy artifacts excluded from package dry run.
  - Test:     `test/readiness-reports.test.ts:63-75` - release-check consumes evidence.
  - External: `https://docs.npmjs.com/cli/v11/commands/npm-pack/` - `npm pack --dry-run` behavior.
  - External: `https://bun.sh/docs/test` - Bun test runner and GitHub Actions integration.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test ./test/cli-e2e.test.ts --test-name-pattern "keeps duplicate copy artifacts out of package dry run"` fails if a copied duplicate artifact is injected into a temp fixture; save to `plans/ulw-evidence/task-8-package-evidence-red.txt`.
  - [ ] GREEN proof captured: the same command passes on the clean tree; save to `plans/ulw-evidence/task-8-package-evidence-green.txt`.
  - [ ] `bun run ci` passes and output saved to `plans/ulw-evidence/task-8-ci.txt`.
  - [ ] `npm pack --dry-run --json --cache /private/tmp/boulder-npm-cache` or `bun pm pack --dry-run --ignore-scripts` passes; output is parsed to confirm name `boulder-oss-cli`, version equals `package.json`, and no `* 2.*` artifacts are included.
  - [ ] `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt` is refreshed only from actual dry-run output.
  - [ ] Temporary cache/tarball artifacts are removed or left only in ignored temp locations, not repo root.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: local CI and package dry-run evidence captured
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-package-ci 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun run ci; printf "\n--- pack ---\n"; bun pm pack --dry-run --ignore-scripts; printf "\nEXIT:$?\n"'; sleep 3; tmux capture-pane -pt ulw-qa-package-ci -S -600 > plans/ulw-evidence/task-8-package-ci.txt; tmux kill-session -t ulw-qa-package-ci
    Expected: plans/ulw-evidence/task-8-package-ci.txt contains successful `bun run smoke`, `bun run build`, package dry-run output, `boulder-oss-cli`, current package version, and "EXIT:0".
    Evidence: plans/ulw-evidence/task-8-package-ci.txt

  Scenario: duplicate copy artifact check catches package slop
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-package-error 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && tmpdir=$(mktemp -d); cp -R package.json src bin docs fixtures README.md LICENSE CHANGELOG.md ROADMAP.md CONTRIBUTING.md SECURITY.md "$tmpdir"/; printf "export const duplicate = true;\n" > "$tmpdir/src/pipeline 2.ts"; (cd "$tmpdir" && bun pm pack --dry-run --ignore-scripts); code=$?; rm -rf "$tmpdir"; printf "\nEXIT:$code\n"'; sleep 2; tmux capture-pane -pt ulw-qa-package-error -S -500 > plans/ulw-evidence/task-8-package-error.txt; tmux kill-session -t ulw-qa-package-error
    Expected: plans/ulw-evidence/task-8-package-error.txt shows whether the package command would include `src/pipeline 2.ts`; if included, the executor must ensure readiness tests block it before completing Task 8.
    Evidence: plans/ulw-evidence/task-8-package-error.txt
  ```

  Commit: YES | Message: `docs(release): refresh package evidence` | Files: [`test/cli-e2e.test.ts`, `test/readiness-reports.test.ts`, `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt`, `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt`, `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt`, `docs/RELEASE_WORKFLOW.md`]

- [ ] 9. Full Regression, Generated Docs Consistency, And Final Evidence Ledger

  What to do: Run the complete automated and manual verification set after all implementation tasks. Regenerate only Boulder-generated docs that changed by command output, capture final evidence, ensure no QA process/temp state remains, and produce a final review packet for the verification wave.
  Must NOT do: Do not edit behavior to pass final verification; failures must route back to the owning task. Do not leave tmux sessions, temp directories, root tarballs, or generated dirty docs unexplained.

  Parallelization: Can parallel: NO | Wave 3 | Blocks: [final] | Blocked by: [6, 7, 8]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `package.json:11-17` - canonical `bun run ci` gate.
  - Pattern:  `src/cli.ts:72-225` - commands that generate docs/evidence outputs.
  - Pattern:  `docs/VERIFICATION_GATES.md` - verification policy doc.
  - Pattern:  `plans/qa/static-gates.md` and `plans/qa/manual-qa-report.md` - existing QA report locations if the executor chooses to refresh them.
  - Test:     All tests under `test/*.test.ts`.
  - External: `https://bun.sh/docs/test` - Bun test filtering/full run behavior.

  Acceptance criteria (agent-executable only):
  - [ ] `bun test` passes and output saved to `plans/ulw-evidence/task-9-bun-test.txt`.
  - [ ] `./node_modules/.bin/tsc --noEmit` passes and output saved to `plans/ulw-evidence/task-9-tsc.txt`.
  - [ ] `bun run ci` passes and output saved to `plans/ulw-evidence/task-9-ci.txt`.
  - [ ] `bun bin/boulder.ts --help` passes and output saved to `plans/ulw-evidence/task-9-help.txt`.
  - [ ] `bun bin/boulder.ts release-check --cwd . --json`, `replay-check --json`, `replay-run --dry-run --json`, `product-readiness --json`, and `service-readiness --json` all run and outputs are saved under `plans/ulw-evidence/task-9-*.json`.
  - [ ] Pure LOC gate has no source file over 250 pure LOC.
  - [ ] `git status --short` contains only intended files plus `evidence/` artifacts and this plan; no temp cache/tarball/root duplicate files remain.
  - [ ] `tmux ls` has no `ulw-qa-*` sessions after cleanup.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: final CLI productization smoke
    Tool:     tmux
    Steps:    tmux new-session -d -s ulw-qa-final-smoke 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts --help; printf "\n--- release ---\n"; bun bin/boulder.ts release-check --cwd . --json; printf "\n--- replay ---\n"; bun bin/boulder.ts replay-run --cwd . --dry-run --json; printf "\n--- readiness ---\n"; bun bin/boulder.ts product-readiness --cwd . --json; bun bin/boulder.ts service-readiness --cwd . --json; printf "\nEXIT:$?\n"'; sleep 3; tmux capture-pane -pt ulw-qa-final-smoke -S -800 > plans/ulw-evidence/task-9-final-smoke.txt; tmux kill-session -t ulw-qa-final-smoke
    Expected: plans/ulw-evidence/task-9-final-smoke.txt contains help text and JSON for release/replay/product/service readiness, contains no stack trace, and ends with "EXIT:0" if all gates are ready or expected non-zero only when honest missing public publish/tag evidence is reported.
    Evidence: plans/ulw-evidence/task-9-final-smoke.txt

  Scenario: final cleanup receipt
    Tool:     bash
    Steps:    cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && { tmux ls 2>/dev/null | rg "ulw-qa-" || true; find . -maxdepth 1 -name "boulder-oss-cli-*.tgz" -print; git status --short; } > plans/ulw-evidence/task-9-cleanup.txt
    Expected: plans/ulw-evidence/task-9-cleanup.txt has no `ulw-qa-*` sessions, no root tarball files, and git status contains only intended tracked edits plus approved evidence/plan artifacts.
    Evidence: plans/ulw-evidence/task-9-cleanup.txt
  ```

  Commit: YES | Message: `chore(qa): capture final productization evidence` | Files: [`docs/PRODUCT_READINESS.md`, `docs/SERVICE_READINESS.md`, `docs/VERIFICATION_REPORT.md`, `evidence/**`, `plans/ulw-boulder-final-productization.md`]

## Final verification wave (MANDATORY - after all implementation tasks)
> Runs in PARALLEL. ALL must APPROVE. Surface results to the caller and wait for an explicit "okay" before declaring complete.
- [ ] F1. Plan compliance audit - every task done, every acceptance criterion met
- [ ] F2. Code quality review - diagnostics clean, idioms match, no dead code
- [ ] F3. Real manual QA - every QA scenario executed with evidence captured
- [ ] F4. Scope fidelity - nothing extra shipped beyond Must-Have, nothing Must-NOT-Have introduced

## Commit strategy
- One logical change per commit. Conventional Commits (`<type>(<scope>): <subject>` body + footer).
- Atomic: every commit builds and passes tests on its own.
- No "WIP" / "fix typo squash later" commits on the final branch - clean up before merge.
- Reference the plan file path in the final commit footer: `Plan: plans/ulw-boulder-final-productization.md`.

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1-F4 approved; commit history clean.
