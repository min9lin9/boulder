# Boulder Repo Brief: boulder-oss-cli

## Detected Surface

- README: yes
- package.json: yes
- pyproject.toml: no
- tests: test
- docs: docs
- CI/config signals: .github/workflows

## Likely Verification Commands

- test: `bun run test` (required)
- build: `bun run build`

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

- none detected by shallow inspection
