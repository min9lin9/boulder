# Boulder Repo Brief: boulder-oss-cli

## Detected Surface

- README: yes
- package.json: yes
- pyproject.toml: no
- tests: test
- docs: docs
- CI/config signals: none detected

## Likely Verification Commands

- test: `bun run test` (required)

## Recommended Maintainer Workflows

- issue-triage
- pr-review-prep
- release-planning
- verification-gate
- dependency-review

## Protected Paths

- .env*
- secrets/**
- vendor/**
- node_modules/**
- dist/**
- coverage/**

## Unresolved Risks

- No CI/config signals detected; release verification may be local-only.
