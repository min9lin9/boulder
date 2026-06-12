# Case Study: Release Workflow

Status: draft evidence

## release workflow Goal

Show how Boulder helps Codex-assisted maintainers prepare release evidence while keeping publishing, tagging, and GitHub release creation manual.

## Repository

- Repository: `https://github.com/min9lin9/boulder`
- Public proof type: externally inspectable public repo and public artifact
- Official category: release workflow

## Commands

```bash
bun bin/boulder.ts release-plan --cwd . --json
bun pm pack --dry-run --ignore-scripts
bun run ci
```

## Evidence

- `docs/CASE_STUDIES/evidence/release-workflow/release-plan.json`
- `docs/CASE_STUDIES/evidence/release-workflow/pack-dry-run.txt`
- `docs/CASE_STUDIES/evidence/release-workflow/ci.txt`

## release-plan Result

The release-plan evidence records package metadata, README, changelog, CI workflow, root harness, operator workflow stack evidence, pipeline planning evidence, application evidence, scorecard evidence, benchmark evidence, version evidence, and package scripts.

## Manual publish Boundary

Boulder does not execute:

- `npm publish`
- `git tag`
- `gh release create`

Those commands remain human-controlled release actions. Boulder can prepare evidence for them, but it does not run them.

## Before

Before Boulder, release readiness evidence lived across package metadata, docs, CI, generated harness files, and manual operator memory.

## After

Boulder produced a structured release-plan JSON, a clean package dry run, and a CI transcript that can be attached to a Codex-assisted release review.

## Limitations

- This case study does not publish a package.
- This case study does not create a tag.
- This case study does not create a GitHub release.
- This case study proves release preparation, not ecosystem adoption.

## Next action

Use this report as the release workflow evidence entry in the Codex OSS application packet after final release state is reconciled.
