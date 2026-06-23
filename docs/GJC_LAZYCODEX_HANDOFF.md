# GJC to LazyCodex Handoff

Status: draft contract

## Purpose

Boulder uses GJC and LazyCodex as staged handoff lanes, not as bundled runtime dependencies.

```text
Boulder classify/export -> GJC plan/review -> LazyCodex implement -> Boulder verify/readiness gate
```

## Responsibilities

| Owner | Responsibility | Boundary |
| --- | --- | --- |
| Boulder | repo inspection, friction classification, handoff packet generation, evidence requirements, product/readiness gate | does not launch GJC, LazyCodex, providers, or external runtimes |
| GJC | planning/review lane for Deep Interview, ralplan review, ultragoal decomposition, acceptance criteria, and evidence expectations | produces approved planning evidence; does not own default implementation |
| LazyCodex | implementation lane for source edits, tests, manual QA, PR-sized work, and unresolved-risk reporting from a GJC-approved plan | does not silently rewrite the plan or expand scope |
| Boulder | final verification, release/product readiness, package hygiene, and claim-to-evidence audit | blocks readiness when plan or implementation evidence is missing |

## Supported GJC Surfaces

Boulder treats GJC as available when `doctor` sees the official Hermes bridge or delegation surfaces: `gjc_coordinator`, `gjc-coordinator-mcp`, `gjc-delegation`, `gjc_delegate_*`, `gjc`, or `gajae-code`.

Non-mutating checks:

```bash
gjc mcp-serve coordinator --check --json
gjc setup hermes --root . --smoke
```

Live delegation, such as `gjc_delegate_plan`, remains approval-gated and should be confirmed by durable turn state, not terminal scrollback.

## Boulder to GJC Input Schema

This is the Boulder to GJC input schema.

Required fields:

- `repo`: repository name, path, public URL when available
- `friction`: `low`, `medium`, or `high`
- `taskClass`: issue triage, PR review, release workflow, core implementation, docs, security, or other
- `repoContext`: brief summary plus protected paths
- `knownRisks`: unresolved risk list
- `ambiguousAssumptions`: assumptions that need Deep Interview
- `pmDebatePrompt`: tradeoff prompt for planning debate
- `csoQaRequired`: boolean for high-friction or security-sensitive work
- `acceptanceCriteriaSeed`: initial pass/fail criteria
- `forbiddenSideEffects`: provider call, credential access, package install, external launch, destructive writes without approval
- `expectedEvidencePaths`: files Boulder expects after planning

## GJC to LazyCodex Output Schema

This is the GJC to LazyCodex output schema.

Required fields:

- `approvedPlan`: final plan text or file path
- `decisionLog`: accepted and rejected options
- `ultragoalGoals`: goal list when decomposition is required
- `fileScope`: exact files or directories LazyCodex may edit
- `testPlan`: tests to add, preserve, or run
- `manualQaPlan`: tmux, browser, HTTP, or computer-use scenarios with exact commands
- `acceptanceCriteria`: binary pass/fail criteria
- `riskRegister`: unresolved risks and owner
- `planDriftPolicy`: when LazyCodex must stop and return to GJC/Boulder

## LazyCodex to Boulder Evidence Schema

Required fields:

- `changedFiles`: exact changed paths
- `testEvidence`: RED/GREEN proof for production changes
- `manualQaEvidence`: transcript, screenshot, curl response, or action log
- `verificationCommands`: full command list and result
- `unresolvedRisks`: remaining risks or explicit none
- `scopeChanges`: any requested scope adjustment
- `readyForReview`: boolean

## Rejection Criteria

These rejection criteria define when Boulder blocks the handoff.

Boulder rejects the handoff if:

- missing GJC planning evidence
- missing LazyCodex implementation evidence
- missing acceptance criteria
- missing manual QA evidence
- plan drift without GJC/Boulder approval
- failed verification
- stale release docs
- dirty package contents
- dirty tree state not explicitly explained
- provider calls, credentials, package installs, or external runtime launch appear in core Boulder commands

## Dry Run

Use dry-run before any approved external handoff:

```bash
boulder handoff send --adapter gajae-code --approve-external --approval-code <code> --dry-run
```

The dry-run prints the candidate adapter command and confirms `external execution: skipped`. It is evidence for routing readiness, not evidence that GJC or LazyCodex executed.

## Plan Drift Policy

LazyCodex must stop implementation and return the work to GJC/Boulder when:

- the approved plan conflicts with repository facts
- tests prove the planned behavior is unsafe or impossible
- file scope must expand
- acceptance criteria are insufficient
- security or release risk increases
- implementation requires credentials, provider calls, package installs, or external runtime launch

## Evidence Paths

Default evidence root:

```text
.omo/ulw-loop/evidence/codex-oss-9-5/
```

Expected files:

- `gjc-plan.md`
- `gjc-ultragoal-goals.json`
- `lazycodex-implementation-summary.md`
- `lazycodex-red-green.txt`
- `lazycodex-manual-qa.txt`
- `boulder-final-readiness.json`

## Runtime Boundary

GJC and LazyCodex are optional operator tools outside Boulder core. Boulder may generate files they can consume, but core commands must not install them, require them, launch them, or depend on profile-local credentials.
