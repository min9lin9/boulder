# Review Policy

Status: active

## Default Flow

1. Open an issue first for large, risky, or ambiguous changes.
2. Keep pull requests small.
3. Include tests, docs impact, risk, and rollback notes.
4. Run local verification before requesting review.
5. Preserve maintainer control of release and product-readiness claims.

## Review Gates

Reviewers should check:

- scope matches the issue or plan
- user-visible behavior is tested
- generated docs and fixtures are intentional
- contract surfaces are stable
- product-readiness remains honest
- no secrets, credentials, private logs, or proprietary data are included
- AI usage is disclosed when relevant

## Contract Checks

Treat these as contract surfaces:

- CLI commands and exit codes
- `boulder.yaml`
- pipeline plan JSON
- export docs
- release-plan output
- product-readiness output
- provider policy and protected paths

Changes to these surfaces need explicit test and docs evidence.

## Merge Expectations

`main` should require CI, review, and CODEOWNERS review for protected paths. GitHub settings must be verified separately from repository files.
