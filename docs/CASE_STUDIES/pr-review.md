# Case Study: PR Review Workflow

Status: draft evidence

## PR Review Goal

Show how Boulder prepares Codex-ready maintainer context for a public PR review workflow without launching providers or making review claims on its own.

## Repository

- Repository: `https://github.com/min9lin9/boulder`
- Public proof type: externally inspectable public repo and public artifact
- Official category: pull request review

## Commands

```bash
bun bin/boulder.ts inspect --cwd . --json
bun bin/boulder.ts pipeline --friction medium
bun bin/boulder.ts export --cwd . --force
```

## Generated files

- `docs/CASE_STUDIES/evidence/pr-review/inspect.json`
- `docs/CASE_STUDIES/evidence/pr-review/pipeline.txt`
- `docs/CASE_STUDIES/evidence/pr-review/export-command.txt`
- `docs/CASE_STUDIES/evidence/pr-review/BOULDER_EXPORT.md`
- `docs/CASE_STUDIES/evidence/pr-review/CODEX_WORKFLOW_NOTES.md`

## Before

Before this run, a reviewer would need to manually gather repo context, protected paths, workflow boundaries, verification commands, provider policy, and unresolved risks.

## After

Boulder produced a Codex-ready export that includes:

- repository brief
- workflow map
- operator workflow stack
- medium-friction Operator Pipeline
- evidence rule
- Codex workflow notes

## PR Review Use

A maintainer can attach the generated export to a Codex PR review prompt so the agent starts with repository context, side-effect boundaries, approval gates, and verification expectations.

## Limitations

- Boulder does not review the PR by itself.
- Boulder does not call Codex or any provider.
- This case study proves review preparation, not review accuracy.
- External maintainer adoption is not yet proven.

## Unresolved risk

The next case-study iteration should run the export against an actual public PR diff and compare the resulting Codex review checklist with maintainer expectations.

## Next action

Use this evidence as the PR review entry in `docs/CODEX_OSS_APPLICATION_PACKET.md`, then add a real public PR-diff variant when available.
