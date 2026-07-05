# Release Plan

Version: 0.1.15
Status: ready

## Checks

- package-json: pass - package.json
- readme: pass - README.md
- changelog: pass - CHANGELOG.md
- ci-workflow: pass - .github/workflows/ci.yml
- root-harness: pass - boulder.yaml
- operator-workflow-stack-doc: pass - docs/OPERATOR_WORKFLOW_STACK.md
- operator-workflow-stack-evidence: pass - Superpowers, GStack, and Compound appear in manifest and operator workflow stack docs
- pipeline-planning-evidence: pass - docs/PIPELINE_PLANNING_SURFACE.md exists and medium pipeline plan validates
- application-evidence: pass - docs/APPLICATION_EVIDENCE.md
- scorecard-evidence: pass - docs/HARNESS_QUALITY_SCORECARD.md
- benchmark-evidence: pass - docs/BENCHMARK_FIXTURE_REPORT.md
- version-evidence: pass - v0.1.15 appears in release-facing docs
- package-scripts: pass - ci, smoke, build, and package dry-run scripts are configured

## Manual Steps

- Run bun run ci.
- Create and push tag v0.1.15.
- Create the GitHub release with verification notes.
- Publishing remains manual; npm publish is not automated by Boulder.

## Scope Boundary

Publishing remains manual. npm publish is not automated by this release plan.
