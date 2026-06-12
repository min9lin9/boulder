# Handoff Validation

Status: pilot workflow

Boulder validates handoff artifacts before claiming a GJC to LazyCodex workflow is repeatable.

## Required Fields

- `officialDocsSources`
- `gjcPlan`
- `gjcPlan.acceptanceCriteria`
- `gjcPlan.manualQaPlan`
- `lazycodexResult`
- `lazycodexResult.changedFiles`
- `lazycodexResult.verificationCommands`
- `lazycodexResult.readyForReview`
- `acceptanceCriteria`

## Boundary

Boulder validates artifacts. It does not launch GJC, LazyCodex, providers, or external runtimes.

## Failure

Missing acceptance criteria, manual QA, official docs sources, verification commands, or ready-for-review status blocks service readiness.
