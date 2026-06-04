# Release Plan

Version: 0.1.6
Status: ready

## Checks

- package-json: pass - package.json
- readme: pass - README.md
- changelog: pass - CHANGELOG.md
- ci-workflow: pass - .github/workflows/ci.yml
- root-harness: pass - boulder.yaml
- application-evidence: pass - docs/APPLICATION_EVIDENCE.md
- scorecard-evidence: pass - docs/HARNESS_QUALITY_SCORECARD.md
- benchmark-evidence: pass - docs/BENCHMARK_FIXTURE_REPORT.md
- version-evidence: pass - v0.1.6 appears in release-facing docs
- package-scripts: pass - ci, smoke, build, and package dry-run scripts are configured

## Manual Steps

- Run bun run ci.
- Create and push tag v0.1.6.
- Create the GitHub release with verification notes.
- Publishing remains manual; npm publish is not automated by Boulder.

## Scope Boundary

Publishing remains manual. npm publish is not automated by this release plan.
