# Boulder Field Evidence MVP Decision-Complete Plan

## TL;DR
> Summary:      Move Boulder from fixture-backed service readiness to a field-evidence MVP that validates planner/executor handoff, official-docs-first replay, capability compatibility, generated metrics, and share-safe public evidence without turning Boulder into a GJC or LazyCodex runtime launcher.
> Deliverables:
> - executable workflow profile, planning packet, execution packet, handoff, capability doctor, field evidence, readiness, and docs updates
> - strict Field Evidence packet contract with real provenance, second-run delta, public/share-safe artifact validation, and generated metrics
> - TDD Bun tests and tmux QA evidence for every implementation task
> - public claim policy that keeps Boulder at `service-pilot-ready` until field evidence is complete
> Effort:       Large
> Risk:         High - the repo already has partial doctor/field-evidence code and stale generated docs, so the executor must harden existing behavior without overclaiming real public adoption.

## Scope
### Must have
- Preserve the approved architecture direction in `docs/WORKFLOW_ARCHITECTURE.md:142`: public surface is `intake -> plan -> execute -> verify -> record`, while `docs/WORKFLOW_ARCHITECTURE.md:121` keeps the eight internal lanes as Boulder grammar.
- Keep GJC as the default planning executor and LazyCodex as the default implementation executor, following `docs/WORKFLOW_ARCHITECTURE.md:166` and `docs/GJC_LAZYCODEX_HANDOFF.md:13`.
- Keep Boulder as workflow manager/evaluator/compound layer; core commands must not launch providers, GJC, LazyCodex, credentials, package installs, or external runtimes, matching `docs/GJC_LAZYCODEX_HANDOFF.md:113`.
- Convert existing partial implementations into strict MVP surfaces: `src/capability-doctor.ts:44` currently reads a fixture inventory, `src/field-evidence.ts:20` currently validates seven required files, and `src/service-readiness.ts:190` already gates service readiness on field evidence.
- Add or harden contracts for workflow profiles, GJC-style planning packets, LazyCodex-compatible execution packets, handoff building, official-docs-first replay, capability discovery, field evidence manifests, generated metrics, and public/share-safe artifact validation.
- Ensure README and public docs expose the current CLI truth: `src/cli.ts:152` has `doctor`, `src/cli.ts:163` has `record field-readiness`, but `README.md:32` still omits both commands.
- Resolve stale generated/readiness docs: `docs/PRODUCT_READINESS.md:20` claims handoff fixtures are missing while `fixtures/handoffs/low.json`, `fixtures/handoffs/medium.json`, and `fixtures/handoffs/high.json` exist.
- Add compatibility doctor coverage for local Bun `1.3.5` versus Gajae-Code live execution needs recorded in `docs/WORKFLOW_ARCHITECTURE.md:22` and `fixtures/capabilities/codex-installed.json:55`.
- Use official documentation first for public OSS replay and tool routing, following `docs/EXTERNAL_REPLAY.md:5` and `src/service-readiness.ts:111`.
- Metis-style gaps this plan closes:
  - Gap 1: field evidence exists but is too easy to spoof with a plain GitHub-looking URL and handwritten metrics.
  - Gap 2: capability doctor classifies from a static fixture and substring heuristics, not an actual inventory snapshot.
  - Gap 3: contract MVP and handoff MVP are described in `docs/WORKFLOW_ARCHITECTURE.md:335` and `docs/WORKFLOW_ARCHITECTURE.md:377`, but not present as executable validators.
  - Gap 4: public docs and readiness reports drift from source behavior.
  - Gap 5: field-backed claim policy is not enforced by product/service readiness.
  - Gap 6: external replay does not yet prove fresh official-docs refresh at field-run time.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do not make Boulder a hosted SaaS, background worker, GJC wrapper, LazyCodex launcher, provider SDK client, credential manager, package installer, or tmux orchestrator.
- Do not remove the internal eight-lane grammar or expose it as required end-user UX.
- Do not claim OpenAI acceptance, adoption, user scale, runtime scale, benchmark leadership, or external maintainer success without public evidence.
- Do not count fixture-backed gates in `fixtures/service-readiness/gates.json:1` as field-backed proof.
- Do not loosen product-readiness failures to make `service-readiness` green.
- Do not edit `vendor/`, `node_modules/`, generated package output, or unrelated dirty files.
- Do not require live GJC execution while local Bun remains below the compatible runtime. Fixture validation and packet validation must continue to work without live GJC.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Bun test. Every production task writes the named failing Bun test first, captures RED output, implements the smallest change, then captures GREEN output.
- QA policy: every task has agent-executed scenarios
- Evidence: `evidence/task-<N>-<slug>.<ext>`

## Execution strategy
### Parallel execution waves
> Target 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks to maximize parallelism.

Wave 1 (no dependencies):
- Task 1: Add workflow profile contract validator
- Task 2: Add planning packet contract validator
- Task 5: Harden capability doctor inventory schema and compatibility rules
- Task 6: Add official-docs-first replay refresh contract

Wave 2 (after Wave 1):
- Task 3: depends [1, 2]
- Task 7: depends [1, 6]

Wave 3 (after Wave 2):
- Task 4: depends [2, 3]
- Task 8: depends [6, 7]
- Task 9: depends [7]

Wave 4 (after Wave 3):
- Task 10: depends [4, 5, 7, 8, 9]
- Task 11: depends [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
- Task 12: depends [4, 5, 6, 7, 8, 9]

Wave 5 (after Wave 4):
- Task 13: depends [10, 11, 12]

Wave 6 (after Wave 5):
- Task 14: depends [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

Critical path: Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 12 -> Task 13 -> Task 14

### Dependency matrix
| Task | Depends on | Blocks | Can parallelize with |
|------|------------|--------|----------------------|
| 1    | none       | 3, 7, 11, 14 | 2, 5, 6 |
| 2    | none       | 3, 4, 11, 14 | 1, 5, 6 |
| 3    | 1, 2       | 4, 14 | 7 |
| 4    | 2, 3       | 10, 12, 14 | 7, 8, 9 |
| 5    | none       | 10, 11, 12, 14 | 1, 2, 6 |
| 6    | none       | 7, 8, 11, 12, 14 | 1, 2, 5 |
| 7    | 1, 6       | 8, 9, 10, 12, 14 | 3 |
| 8    | 6, 7       | 10, 12, 14 | 3, 4, 9 |
| 9    | 7          | 10, 12, 14 | 3, 4, 8 |
| 10   | 4, 5, 7, 8, 9 | 13, 14 | 12 |
| 11   | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 | 13, 14 | 12 |
| 12   | 4, 5, 6, 7, 8, 9 | 13, 14 | 10 |
| 13   | 10, 11, 12 | 14 | none |
| 14   | 1-13       | release/merge | none |

## Todos
> Implementation + Test = ONE task. Never separate.
> Every task MUST have: References + Acceptance Criteria + QA Scenarios + Commit.

- [ ] 1. Add workflow profile contract validator

  What to do: Implement `src/workflow-profile.ts` with a strict validator for `fixtures/workflow-profiles/code-change.json`. The validator must require the public surface `["intake","plan","execute","verify","record"]`, map each public verb to the eight internal lanes from the architecture doc, and reject unknown lanes, missing public verbs, duplicate public verbs, or profiles that make GJC/LazyCodex mandatory runtime dependencies. Add CLI command `boulder workflow-profile validate <path> [--json]` using the existing `src/cli.ts` command style.
  Must NOT do: Do not add runtime execution, provider calls, package installation, or automatic GJC/LazyCodex launches.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [3, 7, 14] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/pipeline.ts:88` - existing fail-closed validator shape and issue objects.
  - Pattern:  `src/cli.ts:77` - current command dispatch and `--json` output branch pattern.
  - API/Type: `docs/WORKFLOW_ARCHITECTURE.md:121` - eight internal lanes that must stay internal.
  - API/Type: `docs/WORKFLOW_ARCHITECTURE.md:142` - five public verbs that must define the user-visible lifecycle.
  - Test:     `test/cli-e2e.test.ts:179` - CLI JSON e2e test pattern.
  - External: `https://openai.github.io/openai-agents-python/tools/` - official tool category and deferred-loading reference for capability surface design.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/workflow-contracts.test.ts -t "workflow profile validates five public verbs"` fails before implementation and output is saved to `evidence/task-1-workflow-profile-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-1-workflow-profile-green.txt`.
  - [ ] `bun bin/boulder.ts workflow-profile validate fixtures/workflow-profiles/code-change.json --json` exits 0 and JSON contains `"status": "pass"`.
  - [ ] Invalid fixture missing `record` exits 1 and JSON contains issue path `surface.record`.

  QA scenarios (MANDATORY - task incomplete without these):
  > Name the exact tool AND its exact invocation - not "verify it works". Browser use: use Chrome to drive the page; if Chrome is not available, download and use agent-browser (https://github.com/vercel-labs/agent-browser). Computer use: OS-level GUI automation for a non-browser desktop app.
  ```
  Scenario: valid workflow profile passes
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task1 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts workflow-profile validate fixtures/workflow-profiles/code-change.json --json; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task1 -S -200 > evidence/task-1-workflow-profile.txt && tmux kill-session -t ulw-qa-task1
    Expected: evidence file contains `"status": "pass"` and `__EXIT:0`
    Evidence: evidence/task-1-workflow-profile.txt

  Scenario: missing public verb fails
    Tool:     tmux
    Steps:    mkdir -p evidence && tmp=$(mktemp -d) && cp fixtures/workflow-profiles/code-change.json "$tmp/bad.json" && bun -e 'const fs=require("fs"); const p=process.argv[1]; const x=JSON.parse(fs.readFileSync(p,"utf8")); x.surface=x.surface.filter((v)=>v!=="record"); fs.writeFileSync(p, JSON.stringify(x,null,2));' "$tmp/bad.json" && tmux new-session -d -s ulw-qa-task1-error "cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts workflow-profile validate '$tmp/bad.json' --json; printf '\n__EXIT:%s\n' \"\$?\"" && sleep 1 && tmux capture-pane -pt ulw-qa-task1-error -S -200 > evidence/task-1-workflow-profile-error.txt && tmux kill-session -t ulw-qa-task1-error && rm -rf "$tmp"
    Expected: evidence file contains `surface.record` and `__EXIT:1`
    Evidence: evidence/task-1-workflow-profile-error.txt
  ```

  Commit: YES | Message: `feat(workflow): validate workflow profiles` | Files: [`src/workflow-profile.ts`, `src/cli.ts`, `fixtures/workflow-profiles/code-change.json`, `test/workflow-contracts.test.ts`, `test/cli-e2e.test.ts`]

- [ ] 2. Add planning packet contract validator

  What to do: Implement `src/planning-packet.ts` and fixture `fixtures/planning-packets/gjc-example.json`. The packet must support GJC as default planner while accepting alternative planners. Required fields: `planner`, `taskClass`, `objective`, `scope.must`, `scope.mustNot`, `acceptanceCriteria`, `manualQaScenarios`, `riskRegister`, `officialDocsSources`, `executorHint`, `evidenceRequirements`, `planDriftPolicy`, and `approvalPolicy`. Add CLI command `boulder planning-packet validate <path> [--json]`.
  Must NOT do: Do not require live GJC, do not shell out to `gjc`, and do not depend on a user's profile-local GJC configuration.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [3, 4, 14] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/handoff-validation.ts:20` - fail-closed JSON validation style.
  - API/Type: `docs/GJC_LAZYCODEX_HANDOFF.md:22` - Boulder-to-GJC input schema fields.
  - API/Type: `docs/WORKFLOW_ARCHITECTURE.md:178` - planner adapter input/output contract.
  - Test:     `test/capability-doctor.test.ts:17` - temp repo JSON fixture test style.
  - External: `https://github.com/Yeachan-Heo/gajae-code` - current GJC public workflow surface: deep-interview, ralplan, ultragoal, tmux/team.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/planning-packet.test.ts -t "validates a GJC planning packet"` fails before implementation and output is saved to `evidence/task-2-planning-packet-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-2-planning-packet-green.txt`.
  - [ ] `bun bin/boulder.ts planning-packet validate fixtures/planning-packets/gjc-example.json --json` exits 0 and includes `"planner": "gjc"`.
  - [ ] Missing `manualQaScenarios` exits 1 with issue path `manualQaScenarios`.
  - [ ] Missing `officialDocsSources` exits 1 with issue path `officialDocsSources`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: GJC planning packet passes
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task2 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts planning-packet validate fixtures/planning-packets/gjc-example.json --json; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task2 -S -200 > evidence/task-2-planning-packet.txt && tmux kill-session -t ulw-qa-task2
    Expected: evidence file contains `"status": "pass"` and `__EXIT:0`
    Evidence: evidence/task-2-planning-packet.txt

  Scenario: missing manual QA fails
    Tool:     tmux
    Steps:    mkdir -p evidence && tmp=$(mktemp -d) && cp fixtures/planning-packets/gjc-example.json "$tmp/bad.json" && bun -e 'const fs=require("fs"); const p=process.argv[1]; const x=JSON.parse(fs.readFileSync(p,"utf8")); delete x.manualQaScenarios; fs.writeFileSync(p, JSON.stringify(x,null,2));' "$tmp/bad.json" && tmux new-session -d -s ulw-qa-task2-error "cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts planning-packet validate '$tmp/bad.json' --json; printf '\n__EXIT:%s\n' \"\$?\"" && sleep 1 && tmux capture-pane -pt ulw-qa-task2-error -S -200 > evidence/task-2-planning-packet-error.txt && tmux kill-session -t ulw-qa-task2-error && rm -rf "$tmp"
    Expected: evidence file contains `manualQaScenarios` and `__EXIT:1`
    Evidence: evidence/task-2-planning-packet-error.txt
  ```

  Commit: YES | Message: `feat(planning): validate planner packets` | Files: [`src/planning-packet.ts`, `src/cli.ts`, `fixtures/planning-packets/gjc-example.json`, `test/planning-packet.test.ts`, `test/cli-e2e.test.ts`]

- [ ] 3. Add execution packet contract validator

  What to do: Implement `src/execution-packet.ts` and fixture `fixtures/execution-packets/lazycodex-example.json`. The packet must consume a planning packet and require `executor`, `objective`, `allowedMutationPaths`, `forbiddenPaths`, `nonGoals`, `verificationRequirements`, `manualQaEvidenceRequirements`, `approvalPolicy`, `planDriftPolicy`, and `returnContract`. Add CLI command `boulder execution-packet validate <path> [--json]`.
  Must NOT do: Do not run LazyCodex, mutate source files, or infer allowed mutation paths from broad directories when the plan specifies exact files.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [4, 14] | Blocked by: [1, 2]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/types.ts:50` - existing result object style with status and output fields.
  - API/Type: `docs/GJC_LAZYCODEX_HANDOFF.md:40` - GJC-to-LazyCodex output schema.
  - API/Type: `docs/WORKFLOW_ARCHITECTURE.md:201` - executor adapter input/output contract.
  - Test:     `test/field-evidence.test.ts:29` - fixture-building test pattern.
  - External: `https://openai.github.io/openai-agents-python/handoffs/` - official handoff concept for structured delegation.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/execution-packet.test.ts -t "validates LazyCodex execution packet"` fails before implementation and output is saved to `evidence/task-3-execution-packet-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-3-execution-packet-green.txt`.
  - [ ] `bun bin/boulder.ts execution-packet validate fixtures/execution-packets/lazycodex-example.json --json` exits 0 and JSON contains `"executor": "lazycodex"`.
  - [ ] Packet with `allowedMutationPaths: ["*"]` exits 1 with issue path `allowedMutationPaths`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: LazyCodex execution packet passes
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task3 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts execution-packet validate fixtures/execution-packets/lazycodex-example.json --json; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task3 -S -200 > evidence/task-3-execution-packet.txt && tmux kill-session -t ulw-qa-task3
    Expected: evidence file contains `"status": "pass"` and `__EXIT:0`
    Evidence: evidence/task-3-execution-packet.txt

  Scenario: wildcard mutation scope fails
    Tool:     tmux
    Steps:    mkdir -p evidence && tmp=$(mktemp -d) && cp fixtures/execution-packets/lazycodex-example.json "$tmp/bad.json" && bun -e 'const fs=require("fs"); const p=process.argv[1]; const x=JSON.parse(fs.readFileSync(p,"utf8")); x.allowedMutationPaths=["*"]; fs.writeFileSync(p, JSON.stringify(x,null,2));' "$tmp/bad.json" && tmux new-session -d -s ulw-qa-task3-error "cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts execution-packet validate '$tmp/bad.json' --json; printf '\n__EXIT:%s\n' \"\$?\"" && sleep 1 && tmux capture-pane -pt ulw-qa-task3-error -S -200 > evidence/task-3-execution-packet-error.txt && tmux kill-session -t ulw-qa-task3-error && rm -rf "$tmp"
    Expected: evidence file contains `allowedMutationPaths` and `__EXIT:1`
    Evidence: evidence/task-3-execution-packet-error.txt
  ```

  Commit: YES | Message: `feat(execution): validate executor packets` | Files: [`src/execution-packet.ts`, `src/cli.ts`, `fixtures/execution-packets/lazycodex-example.json`, `test/execution-packet.test.ts`, `test/cli-e2e.test.ts`]

- [ ] 4. Build GJC-to-LazyCodex handoff transformer

  What to do: Implement `src/handoff-builder.ts` and CLI command `boulder handoff build --plan <planning-packet> --out <execution-packet> [--json]`. It must transform a valid planning packet into a valid execution packet. Mapping rules: objective maps directly; `scope.must` maps to allowed mutation paths only when entries are explicit file or directory paths; `scope.mustNot` maps to non-goals and forbidden paths; acceptance criteria map to verification requirements; manual QA scenarios map to evidence requirements; approval policy and plan drift policy survive unchanged; unsupported planner fields become explicit `notes[]` entries.
  Must NOT do: Do not silently drop scope, expand file access, or infer implementation steps not present in the planning packet.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [10, 12, 14] | Blocked by: [2, 3]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/export.ts:7` - CLI helper writes output files and returns created/skipped status.
  - Pattern:  `src/fs.ts:21` - existing write helper behavior.
  - API/Type: `docs/WORKFLOW_ARCHITECTURE.md:377` - Handoff MVP purpose and expected deliverables.
  - API/Type: `docs/GJC_LAZYCODEX_HANDOFF.md:68` - rejection criteria for handoff artifacts.
  - Test:     `test/cli-e2e.test.ts:75` - end-to-end temp repo workflow style.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/handoff-builder.test.ts -t "builds LazyCodex packet from GJC packet"` fails before implementation and output is saved to `evidence/task-4-handoff-builder-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-4-handoff-builder-green.txt`.
  - [ ] `bun bin/boulder.ts handoff build --plan fixtures/planning-packets/gjc-example.json --out fixtures/execution-packets/lazycodex-generated.json --json` exits 0 and generated packet passes `execution-packet validate`.
  - [ ] Unsupported broad scope fails closed with `scope.must` issue path.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: handoff build creates valid execution packet
    Tool:     tmux
    Steps:    mkdir -p evidence && tmp=$(mktemp -d) && tmux new-session -d -s ulw-qa-task4 "cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts handoff build --plan fixtures/planning-packets/gjc-example.json --out '$tmp/lazycodex-generated.json' --json && bun bin/boulder.ts execution-packet validate '$tmp/lazycodex-generated.json' --json; printf '\n__EXIT:%s\n' \"\$?\"" && sleep 1 && tmux capture-pane -pt ulw-qa-task4 -S -300 > evidence/task-4-handoff-builder.txt && tmux kill-session -t ulw-qa-task4 && rm -rf "$tmp"
    Expected: evidence file contains `"status": "pass"` and `__EXIT:0`
    Evidence: evidence/task-4-handoff-builder.txt

  Scenario: unsafe broad scope fails
    Tool:     tmux
    Steps:    mkdir -p evidence && tmp=$(mktemp -d) && cp fixtures/planning-packets/gjc-example.json "$tmp/bad-plan.json" && bun -e 'const fs=require("fs"); const p=process.argv[1]; const x=JSON.parse(fs.readFileSync(p,"utf8")); x.scope.must=["change whatever is needed"]; fs.writeFileSync(p, JSON.stringify(x,null,2));' "$tmp/bad-plan.json" && tmux new-session -d -s ulw-qa-task4-error "cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts handoff build --plan '$tmp/bad-plan.json' --out '$tmp/out.json' --json; printf '\n__EXIT:%s\n' \"\$?\"" && sleep 1 && tmux capture-pane -pt ulw-qa-task4-error -S -200 > evidence/task-4-handoff-builder-error.txt && tmux kill-session -t ulw-qa-task4-error && rm -rf "$tmp"
    Expected: evidence file contains `scope.must` and `__EXIT:1`
    Evidence: evidence/task-4-handoff-builder-error.txt
  ```

  Commit: YES | Message: `feat(handoff): build executor packet from plan` | Files: [`src/handoff-builder.ts`, `src/cli.ts`, `fixtures/execution-packets/lazycodex-generated.json`, `test/handoff-builder.test.ts`, `test/cli-e2e.test.ts`]

- [ ] 5. Harden capability doctor inventory schema and compatibility rules

  What to do: Extend `src/capability-doctor.ts` so `boulder doctor` can evaluate a generated or fixture inventory with skills, MCP servers, plugins, subagents, runtimes, official docs URLs, versions, and compatibility requirements. Add `boulder doctor snapshot --out fixtures/capabilities/codex-installed.json [--json]` only if it reads local config and writes the requested inventory file without network or provider calls. Add runtime compatibility issue for `gajae-code` requiring Bun `>=1.3.14`; local `bun --version` is `1.3.5`, so status should be `warn`, not `fail`, unless live GJC execution is requested. Add lane routing for `intake`, `plan`, `execute`, `verify`, `record`, and `compound`.
  Must NOT do: Do not install skills/plugins, do not call GJC, do not run external MCP servers, and do not access credentials.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [10, 12, 14] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/capability-doctor.ts:46` - existing report function.
  - Pattern:  `src/capability-doctor.ts:112` - existing Bun compatibility issue.
  - API/Type: `fixtures/capabilities/codex-installed.json:1` - current inventory shape.
  - API/Type: `docs/WORKFLOW_ARCHITECTURE.md:22` - GJC live execution blocked by Bun version mismatch.
  - Test:     `test/capability-doctor.test.ts:17` - current doctor unit tests.
  - External: `https://bun.sh/docs/installation` - official Bun verification and upgrade commands.
  - External: `https://github.com/Yeachan-Heo/gajae-code` - GJC workflow surface and Bun/package context.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/capability-doctor.test.ts -t "detects subagents runtimes and GJC Bun compatibility"` fails before implementation and output is saved to `evidence/task-5-capability-doctor-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-5-capability-doctor-green.txt`.
  - [ ] `bun bin/boulder.ts doctor --cwd . --json` exits 0 or 1 according to inventory validity, never throws, and includes capabilities grouped by lane.
  - [ ] Inventory with Bun `1.3.5` and Gajae-Code capability emits `gajae-code-bun-runtime` warning and next step `Upgrade Bun before live GJC execution.`
  - [ ] Missing inventory fails closed with `capability-inventory-missing`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: doctor reports compatibility warning
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task5 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts doctor --cwd . --json; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task5 -S -300 > evidence/task-5-capability-doctor.txt && tmux kill-session -t ulw-qa-task5
    Expected: evidence file contains `gajae-code-bun-runtime`, `plan`, `execute`, and `__EXIT:0`
    Evidence: evidence/task-5-capability-doctor.txt

  Scenario: missing inventory fails closed
    Tool:     tmux
    Steps:    mkdir -p evidence && tmp=$(mktemp -d) && tmux new-session -d -s ulw-qa-task5-error "cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts doctor --cwd '$tmp' --json; printf '\n__EXIT:%s\n' \"\$?\"" && sleep 1 && tmux capture-pane -pt ulw-qa-task5-error -S -200 > evidence/task-5-capability-doctor-error.txt && tmux kill-session -t ulw-qa-task5-error && rm -rf "$tmp"
    Expected: evidence file contains `capability-inventory-missing` and `__EXIT:1`
    Evidence: evidence/task-5-capability-doctor-error.txt
  ```

  Commit: YES | Message: `feat(doctor): harden capability inventory checks` | Files: [`src/capability-doctor.ts`, `src/cli.ts`, `fixtures/capabilities/codex-installed.json`, `test/capability-doctor.test.ts`, `test/cli-e2e.test.ts`]

- [ ] 6. Add official-docs-first replay refresh contract

  What to do: Implement `src/replay-contract.ts` or extend `src/service-readiness.ts` helpers into a reusable validator for `fixtures/replay/<project>/official-docs.json`, `fixtures/replay/<project>/replay.json`, and field-run `official-docs-refresh.json`. Required official docs fields: `project`, `repoUrl`, `docsUrls`, `versionOrRef`, `retrievedAt`, `retrievedBy`, `setupCommands`, `testCommands`, `contributionPolicy`, `securityPolicy`, `constraints`, and `sourceType: "official"`. Add CLI command `boulder replay validate <project|path> [--json]`. For field runs, require fresh `retrievedAt` date and at least one official docs URL before replay evidence counts.
  Must NOT do: Do not browse or clone external repositories inside the validator. It validates recorded evidence only.

  Parallelization: Can parallel: YES | Wave 1 | Blocks: [7, 8, 12, 14] | Blocked by: []

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/service-readiness.ts:111` - existing official docs coverage check.
  - API/Type: `docs/EXTERNAL_REPLAY.md:5` - official-docs-first rule.
  - API/Type: `fixtures/replay/kimi-agent-swarm-skill/official-docs.json` - current pilot target fixture.
  - Test:     `test/service-readiness.test.ts:139` - missing official documentation failure test.
  - External: `https://modelcontextprotocol.io/docs/learn/architecture` - official MCP architecture docs currently referenced by field evidence.
  - External: `https://modelcontextprotocol.io/specification/2025-06-18/server/tools` - official MCP tools spec for capability/tool replay.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/replay-contract.test.ts -t "requires fresh official docs for replay"` fails before implementation and output is saved to `evidence/task-6-replay-contract-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-6-replay-contract-green.txt`.
  - [ ] `bun bin/boulder.ts replay validate fixtures/replay/kimi-agent-swarm-skill --json` exits 0 with `officialDocsFirst: true`.
  - [ ] Replay manifest with missing `officialDocsPath` exits 1 and issue path `officialDocsPath`.
  - [ ] Field-run official docs refresh without `retrievedAt` exits 1 and issue path `official-docs-refresh.retrievedAt`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: official-docs replay validates
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task6 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts replay validate fixtures/replay/kimi-agent-swarm-skill --json; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task6 -S -300 > evidence/task-6-replay-contract.txt && tmux kill-session -t ulw-qa-task6
    Expected: evidence file contains `"officialDocsFirst": true` and `__EXIT:0`
    Evidence: evidence/task-6-replay-contract.txt

  Scenario: missing official docs path fails
    Tool:     tmux
    Steps:    mkdir -p evidence && tmp=$(mktemp -d) && cp -R fixtures/replay/kimi-agent-swarm-skill "$tmp/replay" && bun -e 'const fs=require("fs"); const p=process.argv[1]; const x=JSON.parse(fs.readFileSync(p,"utf8")); delete x.officialDocsPath; fs.writeFileSync(p, JSON.stringify(x,null,2));' "$tmp/replay/replay.json" && tmux new-session -d -s ulw-qa-task6-error "cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts replay validate '$tmp/replay' --json; printf '\n__EXIT:%s\n' \"\$?\"" && sleep 1 && tmux capture-pane -pt ulw-qa-task6-error -S -200 > evidence/task-6-replay-contract-error.txt && tmux kill-session -t ulw-qa-task6-error && rm -rf "$tmp"
    Expected: evidence file contains `officialDocsPath` and `__EXIT:1`
    Evidence: evidence/task-6-replay-contract-error.txt
  ```

  Commit: YES | Message: `feat(replay): validate official docs first` | Files: [`src/replay-contract.ts`, `src/service-readiness.ts`, `src/cli.ts`, `fixtures/replay/kimi-agent-swarm-skill/official-docs.json`, `test/replay-contract.test.ts`, `test/service-readiness.test.ts`, `test/cli-e2e.test.ts`]

- [ ] 7. Harden field evidence packet schema and record command

  What to do: Replace plain-file-only validation in `src/field-evidence.ts` with a strict `manifest.json` contract that can be generated by `boulder record field-readiness`. Required logical sections: `activation`, `firstReadiness`, `secondReadinessDelta`, `shareSafeArtifact`, `decisionLog`, `officialDocsRefresh`, `generatedMetrics`, `capabilityDoctor`, `handoff`, `claimPolicy`, and `cleanupReceipts`. The command must validate the seven current files for backward compatibility, generate a manifest, and mark status `pilot-ready`, `field-ready`, or `blocked` based on strict checks. It must reject mismatched `runId`, empty evidence files, unsupported decision outcomes, and missing cleanup receipts.
  Must NOT do: Do not treat a local fixture as `field-ready`; fixture-only runs may be `pilot-ready` at most.

  Parallelization: Can parallel: YES | Wave 2 | Blocks: [8, 9, 10, 12, 14] | Blocked by: [1, 6]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/field-evidence.ts:33` - existing evaluate/record functions to extend.
  - Pattern:  `src/cli.ts:163` - current `record field-readiness` command.
  - API/Type: `docs/WORKFLOW_ARCHITECTURE.md:413` - Field Evidence MVP purpose and deliverables.
  - API/Type: `docs/SERVICE_READINESS.md:44` - field evidence required before public service claim.
  - Test:     `test/field-evidence.test.ts:29` - current field evidence tests.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/field-evidence.test.ts -t "writes strict field-readiness manifest"` fails before implementation and output is saved to `evidence/task-7-field-evidence-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-7-field-evidence-green.txt`.
  - [ ] `bun bin/boulder.ts record field-readiness --run-id oss-run-1 --evidence evidence/field-readiness/oss-run-1 --json` writes `evidence/field-readiness/oss-run-1/manifest.json`.
  - [ ] Unsupported decision outcome exits 1 and issue path `decisionLog.outcome`.
  - [ ] Missing cleanup receipt exits 1 unless manifest status is explicitly `pilot-ready` and claim policy blocks `field-ready`.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: record field-readiness manifest
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task7 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts record field-readiness --run-id oss-run-1 --evidence evidence/field-readiness/oss-run-1 --json; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task7 -S -300 > evidence/task-7-field-evidence.txt && tmux kill-session -t ulw-qa-task7
    Expected: evidence file contains `"runId": "oss-run-1"` and `manifest.json`; exit is 0 only if strict evidence passes, otherwise output contains explicit blocking issue paths
    Evidence: evidence/task-7-field-evidence.txt

  Scenario: unsupported decision fails
    Tool:     tmux
    Steps:    mkdir -p evidence && tmp=$(mktemp -d) && cp -R evidence/field-readiness/oss-run-1 "$tmp/oss-run-1" && printf '{"outcome":"ship-it-anyway"}\n' > "$tmp/oss-run-1/decision-log.json" && tmux new-session -d -s ulw-qa-task7-error "cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts record field-readiness --run-id oss-run-1 --evidence '$tmp/oss-run-1' --json; printf '\n__EXIT:%s\n' \"\$?\"" && sleep 1 && tmux capture-pane -pt ulw-qa-task7-error -S -200 > evidence/task-7-field-evidence-error.txt && tmux kill-session -t ulw-qa-task7-error && rm -rf "$tmp"
    Expected: evidence file contains `decisionLog.outcome` or `decision-log` and `__EXIT:1`
    Evidence: evidence/task-7-field-evidence-error.txt
  ```

  Commit: YES | Message: `feat(field): harden field evidence manifest` | Files: [`src/field-evidence.ts`, `src/cli.ts`, `test/field-evidence.test.ts`, `test/cli-e2e.test.ts`]

- [ ] 8. Generate readiness deltas and operating metrics from evidence

  What to do: Implement `src/field-metrics.ts` or extend `src/field-evidence.ts` to generate metrics from field evidence files instead of trusting handwritten `generated-metrics.json`. Required outputs: `time-to-first-readiness-delta`, `readiness delta count`, `public evidence link count`, `official-docs-coverage`, `handoff validity`, and `field-run status`. Add CLI command `boulder metrics field-readiness --evidence <path> [--json]` or wire generation into `record field-readiness`. `generated-metrics.json` must be overwritten or validated as derived from source evidence.
  Must NOT do: Do not report users acquired, adoption, market traction, runtime scale, or field success from a single local run.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [10, 12, 14] | Blocked by: [6, 7]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/service-gates.ts:18` - required service metrics constants.
  - API/Type: `docs/OPERATING_METRICS.md:7` - metric numerator/denominator/source table.
  - API/Type: `docs/SERVICE_STRATEGY_REVIEW.md:152` - metrics ladder and claim limits.
  - Test:     `test/service-readiness.test.ts:52` - metrics gate fixture expectations.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/field-metrics.test.ts -t "generates metrics from field evidence"` fails before implementation and output is saved to `evidence/task-8-field-metrics-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-8-field-metrics-green.txt`.
  - [ ] Generated metrics include numerator, denominator, value, source paths, and `generatedFromEvidence: true`.
  - [ ] If `second-readiness-delta.json` has empty `changedRecommendations`, generated readiness delta count is 0 and field status blocks.
  - [ ] Metrics output contains no adoption, traction, or runtime-scale claim.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: metrics generated from evidence
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task8 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts metrics field-readiness --evidence evidence/field-readiness/oss-run-1 --json; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task8 -S -300 > evidence/task-8-field-metrics.txt && tmux kill-session -t ulw-qa-task8
    Expected: evidence file contains `time-to-first-readiness-delta`, `readiness delta count`, `sourcePaths`, and `__EXIT:0`
    Evidence: evidence/task-8-field-metrics.txt

  Scenario: empty delta blocks metrics
    Tool:     tmux
    Steps:    mkdir -p evidence && tmp=$(mktemp -d) && cp -R evidence/field-readiness/oss-run-1 "$tmp/oss-run-1" && printf '{"changedRecommendations":[]}\n' > "$tmp/oss-run-1/second-readiness-delta.json" && tmux new-session -d -s ulw-qa-task8-error "cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts metrics field-readiness --evidence '$tmp/oss-run-1' --json; printf '\n__EXIT:%s\n' \"\$?\"" && sleep 1 && tmux capture-pane -pt ulw-qa-task8-error -S -200 > evidence/task-8-field-metrics-error.txt && tmux kill-session -t ulw-qa-task8-error && rm -rf "$tmp"
    Expected: evidence file contains `readiness delta count` and `__EXIT:1`
    Evidence: evidence/task-8-field-metrics-error.txt
  ```

  Commit: YES | Message: `feat(metrics): derive field readiness metrics` | Files: [`src/field-metrics.ts`, `src/field-evidence.ts`, `src/cli.ts`, `test/field-metrics.test.ts`, `test/field-evidence.test.ts`]

- [ ] 9. Add share-safe public artifact validation

  What to do: Replace the current `share-safe-artifact-url.txt` check in `src/field-evidence.ts:83` with a structured share-safety validator. It must accept either a public GitHub URL verified by HTTP HEAD/GET during QA, or `visibility: "share-safe-local"` that is allowed only for `pilot-ready`, not `field-ready`. Checks must reject local absolute paths, private repo assumptions, secret-like strings, unsupported claims, non-GitHub public URLs unless explicitly allowed, and URLs that are not reachable when network is available. Add `src/share-safety.ts` if that keeps concerns separate.
  Must NOT do: Do not make a fake GitHub-looking URL count as field-backed proof without reachability evidence.

  Parallelization: Can parallel: YES | Wave 3 | Blocks: [10, 12, 14] | Blocked by: [7]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/field-evidence.ts:83` - current minimal URL check to replace.
  - API/Type: `docs/SERVICE_STRATEGY_REVIEW.md:138` - distribution through public artifacts.
  - API/Type: `docs/SERVICE_READINESS.md:48` - public share-safe artifact URL requirement.
  - Test:     `test/field-evidence.test.ts:41` - failure-case style.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/share-safety.test.ts -t "rejects fake public artifact urls"` fails before implementation and output is saved to `evidence/task-9-share-safety-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-9-share-safety-green.txt`.
  - [ ] Artifact URL `https://github.com/min9lin9/boulder/pull/field-evidence-mvp` without recorded HTTP status does not count as `field-ready`.
  - [ ] A `share-safe-local` artifact can support `pilot-ready` only and produces a claim-policy warning.
  - [ ] Secret-like content such as `sk-`, `ghp_`, `.env`, or `/Users/` fails validation.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: public artifact URL is checked
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task9 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && url=$(cat evidence/field-readiness/oss-run-1/share-safe-artifact-url.txt) && curl -I -L --max-time 15 "$url"; printf "\n__EXIT:%s\n" "$?"' && sleep 3 && tmux capture-pane -pt ulw-qa-task9 -S -300 > evidence/task-9-share-safety.txt && tmux kill-session -t ulw-qa-task9
    Expected: evidence file contains an HTTP status line; if status is not 2xx/3xx, field-ready remains blocked with a public artifact issue
    Evidence: evidence/task-9-share-safety.txt

  Scenario: local path and secret-like artifact fails
    Tool:     tmux
    Steps:    mkdir -p evidence && tmp=$(mktemp -d) && cp -R evidence/field-readiness/oss-run-1 "$tmp/oss-run-1" && printf '/Users/burt/private sk-test\n' > "$tmp/oss-run-1/share-safe-artifact-url.txt" && tmux new-session -d -s ulw-qa-task9-error "cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts record field-readiness --run-id oss-run-1 --evidence '$tmp/oss-run-1' --json; printf '\n__EXIT:%s\n' \"\$?\"" && sleep 1 && tmux capture-pane -pt ulw-qa-task9-error -S -200 > evidence/task-9-share-safety-error.txt && tmux kill-session -t ulw-qa-task9-error && rm -rf "$tmp"
    Expected: evidence file contains `shareSafeArtifact` and `__EXIT:1`
    Evidence: evidence/task-9-share-safety-error.txt
  ```

  Commit: YES | Message: `feat(field): validate share safe artifacts` | Files: [`src/share-safety.ts`, `src/field-evidence.ts`, `test/share-safety.test.ts`, `test/field-evidence.test.ts`]

- [ ] 10. Integrate field evidence with service and product readiness

  What to do: Update `src/service-readiness.ts` and `src/product-readiness.ts` so service readiness distinguishes `blocked`, `pilot-ready`, and `field-ready` evidence internally, while the public status remains conservative: `ready` only if product-readiness is ready and field evidence is field-ready. Update product readiness to include field-evidence claim policy only as a gate for public service claims, not for basic package readiness. Regenerate `docs/SERVICE_READINESS.md` and `docs/PRODUCT_READINESS.md` via CLI after implementation.
  Must NOT do: Do not make product-readiness pass by weakening existing failed gates for public CI, install smoke, support templates, or duplicate copy artifacts.

  Parallelization: Can parallel: YES | Wave 4 | Blocks: [13, 14] | Blocked by: [4, 5, 7, 8, 9]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `src/service-readiness.ts:41` - current readiness aggregation.
  - Pattern:  `src/product-readiness.ts:24` - current product readiness checks.
  - API/Type: `docs/SERVICE_READINESS.md:17` - current next-step policy says fixture-backed service must not claim field-backed readiness.
  - API/Type: `docs/PRODUCT_READINESS.md:7` - current generated product readiness has stale failures.
  - Test:     `test/service-readiness.test.ts:108` - current service readiness status tests.
  - Test:     `test/product-readiness.test.ts` - product readiness gate patterns.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/service-readiness.test.ts -t "keeps service pilot-ready until field evidence is field-ready"` fails before implementation and output is saved to `evidence/task-10-readiness-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-10-readiness-green.txt`.
  - [ ] `bun bin/boulder.ts service-readiness --json` includes `field-evidence` with exact status and evidence path.
  - [ ] `bun bin/boulder.ts product-readiness --json` still fails for unresolved public product blockers and does not report one blended 9.5 score.
  - [ ] Generated docs no longer contradict source truth about existing handoff fixtures.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: service readiness reports field evidence status
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task10 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts service-readiness --json; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task10 -S -300 > evidence/task-10-service-readiness.txt && tmux kill-session -t ulw-qa-task10
    Expected: evidence file contains `field-evidence`; exit is 0 only when all service checks pass, otherwise exact blockers are visible
    Evidence: evidence/task-10-service-readiness.txt

  Scenario: product readiness remains honest
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task10-error 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts product-readiness --json; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task10-error -S -300 > evidence/task-10-product-readiness.txt && tmux kill-session -t ulw-qa-task10-error
    Expected: evidence file contains unresolved blockers such as `clean-release-tree`, `published-install-smoke`, or public evidence gaps; no unsupported ready claim appears
    Evidence: evidence/task-10-product-readiness.txt
  ```

  Commit: YES | Message: `feat(readiness): gate service claims on field evidence` | Files: [`src/service-readiness.ts`, `src/product-readiness.ts`, `docs/SERVICE_READINESS.md`, `docs/PRODUCT_READINESS.md`, `test/service-readiness.test.ts`, `test/product-readiness.test.ts`]

- [ ] 11. Add public docs skeleton for Field Evidence and current command surface

  What to do: Update docs before final field capture so users and executors see the real public surface. Add `docs/FIELD_READINESS_PACKET.md` describing the packet, files, manifest schema, claim policy, cleanup receipts, and exact commands. Update `README.md` command lists to include `doctor`, `record field-readiness`, `workflow-profile validate`, `planning-packet validate`, `execution-packet validate`, `handoff build`, `replay validate`, and metrics command once implemented. Update `docs/WORKFLOW_ARCHITECTURE.md` immediate next work from "Start with Phase 1 only" to reflect current partial implementation and this Field Evidence MVP plan.
  Must NOT do: Do not claim commands exist in README before their implementation tasks have landed.

  Parallelization: Can parallel: YES | Wave 4 | Blocks: [13, 14] | Blocked by: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `README.md:32` - current command list to update.
  - Pattern:  `src/cli.ts:205` - authoritative help output list.
  - API/Type: `docs/WORKFLOW_ARCHITECTURE.md:420` - Field Evidence MVP expected deliverables.
  - API/Type: `docs/SERVICE_STRATEGY_REVIEW.md:163` - missing field-backed work list.
  - Test:     `test/cli-e2e.test.ts:201` - command surface e2e test pattern.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/docs-surface.test.ts -t "README lists current Boulder commands"` fails before implementation and output is saved to `evidence/task-11-docs-surface-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-11-docs-surface-green.txt`.
  - [ ] `docs/FIELD_READINESS_PACKET.md` exists and includes every required field-evidence file plus `manifest.json`.
  - [ ] README command list matches `bun bin/boulder.ts --help` for public commands.
  - [ ] Docs state Boulder does not launch GJC, LazyCodex, providers, or external runtimes.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: README command surface matches help
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task11 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts --help && rg -n "doctor|record field-readiness|workflow-profile|planning-packet|execution-packet|handoff build|replay validate|metrics field-readiness" README.md docs/FIELD_READINESS_PACKET.md; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task11 -S -400 > evidence/task-11-docs-surface.txt && tmux kill-session -t ulw-qa-task11
    Expected: evidence file contains every command and `__EXIT:0`
    Evidence: evidence/task-11-docs-surface.txt

  Scenario: docs reject runtime-launch overclaim
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task11-error 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && rg -n "does not launch GJC|does not launch LazyCodex|No provider launch|not hosted SaaS" README.md docs/FIELD_READINESS_PACKET.md docs/WORKFLOW_ARCHITECTURE.md; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task11-error -S -300 > evidence/task-11-docs-overclaim.txt && tmux kill-session -t ulw-qa-task11-error
    Expected: evidence file contains explicit non-runtime-launch language and `__EXIT:0`
    Evidence: evidence/task-11-docs-overclaim.txt
  ```

  Commit: YES | Message: `docs(field): document field readiness packet` | Files: [`README.md`, `docs/FIELD_READINESS_PACKET.md`, `docs/WORKFLOW_ARCHITECTURE.md`, `test/docs-surface.test.ts`]

- [ ] 12. Capture one Field Evidence MVP pilot run against a public OSS target

  What to do: Create or refresh `evidence/field-readiness/oss-run-1/` using an actual run. Default target is `min9lin9/kimi-agent-swarm-skill`, already recorded in `docs/EXTERNAL_REPLAY.md:13`; if unavailable, use Boulder itself only as a fallback and mark the run `pilot-ready`, not `field-ready`. Capture activation transcript, first readiness output, second readiness delta after a concrete repo event/change, share-safe artifact validation, maintainer decision log, official docs refresh, generated metrics, capability doctor output, handoff build output, and cleanup receipts. The executor must use tmux for all CLI capture and must not use hidden local state as public proof.
  Must NOT do: Do not fabricate a public artifact URL, do not mark field-ready if the URL is unreachable, and do not overwrite existing evidence without preserving old run ID or creating a new run ID.

  Parallelization: Can parallel: YES | Wave 4 | Blocks: [13, 14] | Blocked by: [4, 5, 6, 7, 8, 9]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `evidence/field-readiness/oss-run-1/official-docs-refresh.json:1` - current official docs refresh is present but lacks retrieval provenance.
  - Pattern:  `evidence/field-readiness/oss-run-1/generated-metrics.json:1` - current metrics are handwritten and must become generated.
  - API/Type: `docs/WORKFLOW_ARCHITECTURE.md:420` - expected Field Evidence MVP files.
  - API/Type: `docs/SERVICE_STRATEGY_REVIEW.md:77` - field-backed upgrade plan.
  - Test:     `test/field-evidence.test.ts:30` - complete field run fixture test.
  - External: `https://github.com/min9lin9/kimi-agent-swarm-skill` - default public replay target.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured for the new stricter fixture: `bun test test/field-evidence.test.ts -t "passes a field-ready public run only with reachable artifact"` fails before evidence update and output is saved to `evidence/task-12-field-run-red.txt`.
  - [ ] GREEN proof captured: same command passes after evidence update or reports `pilot-ready` with explicit public URL blocker and output is saved to `evidence/task-12-field-run-green.txt`.
  - [ ] `evidence/field-readiness/oss-run-1/manifest.json` exists and includes all required sections.
  - [ ] `official-docs-refresh.json` includes official URLs, `retrievedAt`, `retrievedBy`, and `sourceType: "official"`.
  - [ ] `generated-metrics.json` is produced by the metrics command and contains source paths.
  - [ ] Public/share-safe artifact is either reachable via `curl -I -L --max-time 15 <url>` or the run remains `pilot-ready` with a blocking issue.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: field run records manifest and metrics
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task12 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts doctor --cwd . --json > evidence/field-readiness/oss-run-1/capability-doctor.json && bun bin/boulder.ts handoff build --plan fixtures/planning-packets/gjc-example.json --out evidence/field-readiness/oss-run-1/execution-packet.json --json > evidence/field-readiness/oss-run-1/handoff-build.json && bun bin/boulder.ts metrics field-readiness --evidence evidence/field-readiness/oss-run-1 --json > evidence/field-readiness/oss-run-1/generated-metrics.json && bun bin/boulder.ts record field-readiness --run-id oss-run-1 --evidence evidence/field-readiness/oss-run-1 --json; printf "\n__EXIT:%s\n" "$?"' && sleep 2 && tmux capture-pane -pt ulw-qa-task12 -S -500 > evidence/task-12-field-run.txt && tmux kill-session -t ulw-qa-task12
    Expected: evidence file contains `manifest.json`; exit is 0 only if strict field evidence passes, otherwise output contains explicit blocker issue paths
    Evidence: evidence/task-12-field-run.txt

  Scenario: public artifact reachability is captured
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task12-error 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && url=$(cat evidence/field-readiness/oss-run-1/share-safe-artifact-url.txt) && curl -I -L --max-time 15 "$url"; printf "\n__EXIT:%s\n" "$?"' && sleep 3 && tmux capture-pane -pt ulw-qa-task12-error -S -300 > evidence/task-12-public-artifact.txt && tmux kill-session -t ulw-qa-task12-error
    Expected: evidence file contains HTTP status; if not 2xx/3xx, `manifest.json` must contain a blocker and no `field-ready` claim
    Evidence: evidence/task-12-public-artifact.txt
  ```

  Commit: YES | Message: `test(field): capture field readiness pilot evidence` | Files: [`evidence/field-readiness/oss-run-1/**`, `fixtures/replay/kimi-agent-swarm-skill/**`, `test/field-evidence.test.ts`]

- [ ] 13. Add end-to-end CLI and package gate for Field Evidence MVP

  What to do: Add e2e coverage that runs the full CLI sequence from `doctor` through workflow/profile packet validation, handoff build, replay validate, metrics generation, record field-readiness, service-readiness, and product-readiness. Ensure package contents include new source/docs/fixtures/evidence files intentionally and exclude duplicate copy artifacts. Update `package.json` scripts only if the repo already uses that pattern; keep `bun run ci` as the main gate from `boulder.yaml:30`.
  Must NOT do: Do not add flaky network-only CI tests. Network reachability belongs in tmux QA evidence, while CI can validate recorded reachability metadata.

  Parallelization: Can parallel: NO | Wave 5 | Blocks: [14] | Blocked by: [10, 11, 12]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `test/cli-e2e.test.ts:75` - full init/export e2e pattern.
  - Pattern:  `package.json:11` - existing scripts and `bun run ci`.
  - API/Type: `boulder.yaml:30` - configured verification command.
  - API/Type: `package.json:28` - package `files` allowlist.
  - Test:     `test/cli-e2e.test.ts:201` - doctor and field-readiness CLI patterns.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/cli-e2e.test.ts -t "runs field evidence MVP CLI sequence"` fails before implementation and output is saved to `evidence/task-13-cli-e2e-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-13-cli-e2e-green.txt`.
  - [ ] `bun test` passes.
  - [ ] `bun run ci` passes.
  - [ ] `bun pm pack --dry-run --ignore-scripts` output does not include ` 2.` duplicate artifacts and includes intended new docs/fixtures/evidence only if package policy allows them.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: full Field Evidence CLI sequence
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task13 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun bin/boulder.ts doctor --cwd . --json && bun bin/boulder.ts workflow-profile validate fixtures/workflow-profiles/code-change.json --json && bun bin/boulder.ts planning-packet validate fixtures/planning-packets/gjc-example.json --json && bun bin/boulder.ts handoff build --plan fixtures/planning-packets/gjc-example.json --out /tmp/boulder-lazycodex-generated.json --json && bun bin/boulder.ts replay validate fixtures/replay/kimi-agent-swarm-skill --json && bun bin/boulder.ts record field-readiness --run-id oss-run-1 --evidence evidence/field-readiness/oss-run-1 --json && bun bin/boulder.ts service-readiness --json; printf "\n__EXIT:%s\n" "$?"' && sleep 3 && tmux capture-pane -pt ulw-qa-task13 -S -800 > evidence/task-13-cli-e2e.txt && tmux kill-session -t ulw-qa-task13
    Expected: evidence file contains each command output and final `__EXIT:0` only when all strict gates pass; otherwise exact blocking issue path is present
    Evidence: evidence/task-13-cli-e2e.txt

  Scenario: package dry run excludes duplicate artifacts
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task13-error 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun pm pack --dry-run --ignore-scripts; printf "\n__EXIT:%s\n" "$?"' && sleep 2 && tmux capture-pane -pt ulw-qa-task13-error -S -500 > evidence/task-13-pack-dry-run.txt && tmux kill-session -t ulw-qa-task13-error
    Expected: evidence file contains `__EXIT:0` and no lines matching ` 2.`
    Evidence: evidence/task-13-pack-dry-run.txt
  ```

  Commit: YES | Message: `test(cli): cover field evidence mvp flow` | Files: [`test/cli-e2e.test.ts`, `package.json`, `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt`]

- [ ] 14. Final claim audit and release-readiness reconciliation

  What to do: Run a final static and CLI audit that reconciles README, CLI help, architecture docs, service readiness, product readiness, final audit, scorecard, field evidence manifest, and package output. Update `docs/CODEX_OSS_FINAL_AUDIT.md`, `docs/CODEX_OSS_SCORECARD.md`, `docs/SERVICE_STRATEGY_REVIEW.md`, and `docs/CODEX_OSS_APPLICATION_PACKET.md` only to reflect evidenced reality. If field evidence is still `pilot-ready`, the docs must say Boulder is not field-backed. If field evidence is `field-ready`, docs must link the manifest and public artifact evidence.
  Must NOT do: Do not raise scores or readiness labels unless every gate has evidence from tasks 1-13.

  Parallelization: Can parallel: NO | Wave 6 | Blocks: [release/merge] | Blocked by: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

  References (executor has NO interview context - be exhaustive):
  - Pattern:  `docs/CODEX_OSS_FINAL_AUDIT.md:56` - current "Does Not Claim" section.
  - Pattern:  `docs/CODEX_OSS_SCORECARD.md:75` - allowed/disallowed claim policy.
  - API/Type: `docs/SERVICE_STRATEGY_REVIEW.md:175` - decision criteria for public service readiness.
  - API/Type: `docs/WORKFLOW_ARCHITECTURE.md:452` - score ladder tied to Field Evidence MVP.
  - Test:     `test/docs-surface.test.ts` - docs command/claim checks from Task 11.

  Acceptance criteria (agent-executable only):
  - [ ] RED proof captured: `bun test test/claim-policy.test.ts -t "blocks field-backed claim without field-ready manifest"` fails before implementation and output is saved to `evidence/task-14-claim-policy-red.txt`.
  - [ ] GREEN proof captured: same command passes after implementation and output is saved to `evidence/task-14-claim-policy-green.txt`.
  - [ ] `rg -n "field-backed|field-ready|service-ready|9.5|98 / 100" docs README.md` shows every strong claim has a nearby evidence link or explicit limitation.
  - [ ] `bun run ci` passes after docs updates.
  - [ ] `git status --short` contains only intentional files from this plan and no unexplained duplicate `* 2.*` artifacts.

  QA scenarios (MANDATORY - task incomplete without these):
  ```
  Scenario: claim audit has evidence links
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task14 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && rg -n "field-backed|field-ready|service-ready|9.5|98 / 100|OpenAI acceptance|adoption|runtime scale" README.md docs/CODEX_OSS_FINAL_AUDIT.md docs/CODEX_OSS_SCORECARD.md docs/SERVICE_STRATEGY_REVIEW.md docs/WORKFLOW_ARCHITECTURE.md docs/CODEX_OSS_APPLICATION_PACKET.md; printf "\n__EXIT:%s\n" "$?"' && sleep 1 && tmux capture-pane -pt ulw-qa-task14 -S -600 > evidence/task-14-claim-audit.txt && tmux kill-session -t ulw-qa-task14
    Expected: every positive readiness claim is paired with evidence or limitation language; unsupported acceptance/adoption/runtime-scale claims appear only in "does not claim" sections
    Evidence: evidence/task-14-claim-audit.txt

  Scenario: final CI and tree audit
    Tool:     tmux
    Steps:    mkdir -p evidence && tmux new-session -d -s ulw-qa-task14-error 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && bun run ci && git status --short && printf "\n__EXIT:%s\n" "$?"' && sleep 5 && tmux capture-pane -pt ulw-qa-task14-error -S -1000 > evidence/task-14-final-ci-tree.txt && tmux kill-session -t ulw-qa-task14-error
    Expected: evidence file contains successful CI output, intentional changed files only, and `__EXIT:0`
    Evidence: evidence/task-14-final-ci-tree.txt
  ```

  Commit: YES | Message: `docs(readiness): reconcile field evidence claims` | Files: [`README.md`, `docs/CODEX_OSS_FINAL_AUDIT.md`, `docs/CODEX_OSS_SCORECARD.md`, `docs/SERVICE_STRATEGY_REVIEW.md`, `docs/CODEX_OSS_APPLICATION_PACKET.md`, `test/claim-policy.test.ts`]

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
- Reference the plan file path in the final commit footer: `Plan: plans/boulder-field-evidence-mvp-decision-complete.md`.

## Success criteria
- All Must-Have shipped; all QA scenarios pass with captured evidence; F1-F4 approved; commit history clean.
