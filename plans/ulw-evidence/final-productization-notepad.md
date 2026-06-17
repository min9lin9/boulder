# Boulder Final Productization Notepad

Started: 2026-06-17T13:22:59Z

## Skills

- `omo:programming`: TypeScript/Bun CLI code and tests will be edited.
- `omo:remove-ai-slops`: User explicitly requested slop cleanup; behavior must be locked before cleanup.
- `beej-plan-critic`: Reviewed as available, but not applicable because this task does not touch Beej/C/sockets/IPC/GDB/Git-internals implementation.
- `multi_agent plan`: Required because the task is multi-file and architectural.
- `multi_agent explorer`: Required by user request to use Explorer; read-only code map.

## Binding Success Criteria

Deliverable: Boulder reaches a tighter external-repeat-use productization slice with release evidence alignment, clearer Codex onboarding, adapter dry-run clarity, replay/readiness evidence, README diet, and behavior-preserving cleanup.

1. Release evidence alignment
   - Automated test: `test/cli-e2e.test.ts` test id TBD, written RED first.
   - Manual QA: tmux session `ulw-qa-release-check` runs `bun bin/boulder.ts release-check --cwd . --json`; PASS if stdout JSON reports `blocked` honestly while local tag evidence is missing and version evidence mentions `0.1.14`.

2. Codex onboarding and skill clarity
   - Automated test: `test/cli-e2e.test.ts` test id TBD, written RED first.
   - Manual QA: tmux session `ulw-qa-onboard` runs init/quickstart/doctor in a temp repo; PASS if output names `gajae-code`, `lazycodex`, and `configured-unverified` when inventory is absent.

3. Adapter command dry-run surface
   - Automated test: `test/handoff-cli-e2e.test.ts` or new adapter test id TBD, written RED first.
   - Manual QA: tmux session `ulw-qa-handoff-dry-run` runs handoff packet/review/send dry-run flow; PASS if no external send occurs and command adapter candidate is shown.

4. External replay/product readiness evidence
   - Automated test: `test/readiness-reports.test.ts` test id TBD, written RED first.
   - Manual QA: tmux session `ulw-qa-replay` runs `bun bin/boulder.ts replay-check --cwd . --json` and `service-readiness`; PASS if public replay cases pass.

5. Slop cleanup and size discipline
   - Automated test: existing full `bun test` plus `bunx tsc --noEmit`.
   - Manual QA: tmux session `ulw-qa-help` runs `bun bin/boulder.ts --help`; PASS if command list still exposes the expected user entrypoints.

## RED/GREEN Evidence

Pending.

## Manual QA Evidence

Pending.

## Cleanup Receipts

Pending.

## Findings

- Current Bun version is 1.3.14.
- Code review graph has no registered repo; using Explorer, rg, tsc, and tests instead.
- Files over 200 pure LOC: `src/service-readiness.ts`, `src/workflow-profiles.ts`, `src/cli.ts`, `src/handoff-command.ts`, `src/capability-doctor.ts`, `src/handoff-paths.ts`, `src/scorecard.ts`, `src/handoff-packet.ts`, plus two tests. None exceed 250 yet.
RED 2026-06-17: bun test test/readiness-reports.test.ts test/handoff-cli-e2e.test.ts -> 19 pass / 3 fail. Missing ci-bun-engine check, quickstart adapter preference text, handoff send --dry-run output.
GREEN 2026-06-17: bun test test/readiness-reports.test.ts test/handoff-cli-e2e.test.ts -> 22 pass / 0 fail.

## Manual QA Evidence

- release-check: PASS, artifact `plans/ulw-evidence/release-check.cli.txt`; command `bun bin/boulder.ts release-check --cwd . --json`; observable `status: blocked`, `ci-bun-engine` and `install-smoke-version` pass, and `git-tag-local` fails with missing local tag evidence.
- replay/service: PASS, artifact `plans/ulw-evidence/replay-service.cli.txt`; commands `replay-check --json` and `service-readiness --json`; observable both `status: ready`.
- onboarding/doctor: PASS, artifact `plans/ulw-evidence/onboard-doctor.cli.txt`; command sequence `init`, `quickstart`, `doctor`; observable quickstart names GJC/LazyCodex preferences and doctor reports adapter state.
- handoff dry-run: PASS, artifact `plans/ulw-evidence/handoff-dry-run.cli.txt`; command sequence `handoff packet`, `handoff review`, `handoff send --dry-run`; observable `external execution: skipped` and `bunx gajae-code` command candidate.
- product/service readiness: PASS, command output in conversation; `product-readiness --json` reports `blocked` on `public-release-check`, and `service-readiness --json` reports `pilot-ready` while public product readiness is blocked.
- help/CI: PASS, artifact command output in conversation; `bun run ci` exposed help with `handoff send ... [--dry-run]`, `133 pass / 0 fail`, build and pack dry-run passed.

## Cleanup Receipts

- tmux channel attempt failed: `error connecting to /private/tmp/tmux-501/default (Operation not permitted)`; no tmux sessions were created.
- release-check CLI: no temp state.
- replay/service CLI: no temp state.
- onboarding/doctor CLI: temp dir `/tmp/boulder-onboard-P1YPRu` removed.
- handoff dry-run CLI: temp dir `/tmp/boulder-handoff-zV9Hxz` and `/tmp/boulder-review.txt` removed.

## Verification

- `bun test test/readiness-reports.test.ts test/handoff-cli-e2e.test.ts`: GREEN, 22 pass / 0 fail.
- `bun test`: GREEN, 133 pass / 0 fail.
- `bunx tsc --noEmit`: GREEN.
- `bun run ci`: GREEN, smoke + build + pack dry-run.
- LSP diagnostics: GREEN, TypeScript server scanned `src` 44 files, 0 diagnostics.

## Post-write Review

- Single responsibility: touched modules keep existing responsibilities; `handoff-command.ts` remains CLI handoff orchestration.
- Boundary purity: no raw workspace content or external execution is introduced; dry-run prints command candidates only.
- Variant discrimination: no new tagged union discrimination needing exhaustive switch.
- Escape hatches: no `any`, `as any`, `as unknown`, non-null assertions, or ts-ignore added.
- Defensive layer: no redundant null checks added.
- Helpers for one-off: `formatHandoffSendDryRun` is a CLI formatting helper used by the new send dry-run path.
- Tests: new behavior is locked by failing tests that went RED then GREEN.
- Size: touched source files are below 250 pure LOC; `src/handoff-command.ts` is warning-band at 243 LOC and should be split before the next feature grows it.
RED 2026-06-17 review fix: bun test test/readiness-reports.test.ts test/cli-e2e.test.ts -> 21 pass / 2 fail. release-check still returned ready without local tag.
GREEN 2026-06-17 review fix: bun test test/readiness-reports.test.ts test/cli-e2e.test.ts -> 23 pass / 0 fail. release-check blocks when local v0.1.14 tag is absent.
RED 2026-06-17 readiness fix: bun test test/product-readiness.test.ts --test-name-pattern "blocks when release tag or published install evidence does not match package version" -> expected blocked, received ready. product-readiness did not consume release-check.
GREEN 2026-06-17 readiness fix: bun test test/product-readiness.test.ts --test-name-pattern "blocks when release tag or published install evidence does not match package version" -> 1 pass / 0 fail. product-readiness now blocks on public-release-check when git-tag-local is missing.
GREEN 2026-06-17 service fail-closed fix: bun test test/product-readiness.test.ts test/service-readiness.test.ts -> 11 pass / 0 fail. release-check now fails closed when package.json is missing in service fixtures.
GREEN 2026-06-17 size fix: `src/handoff-command.ts` reduced to 248 lines by moving dry-run formatting to `src/handoff-send-format.ts`.
