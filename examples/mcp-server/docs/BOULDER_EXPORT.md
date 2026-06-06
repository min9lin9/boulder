# Boulder Export

This export packages repository context for Codex-ready OSS maintenance.

# Boulder Repo Brief: boulder-mcp-example

## Detected Surface

- README: yes
- package.json: yes
- pyproject.toml: no
- tests: none detected
- docs: docs
- CI/config signals: none detected

## Likely Verification Commands

- test: `bun run test` (required)
- typecheck: `bun run typecheck`

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

- No test directory detected; verification may rely on manual smoke.
- No CI/config signals detected; release verification may be local-only.


## Workflow Map

- issue-triage
- pr-review-prep
- release-planning
- verification-gate
- dependency-review

## Operator Workflow Stack

- superpowers: workflow-spine (required)
- gstack: review-gate (required)
- compound: learning-layer (required)

## Evidence Rule

Before claiming completion, attach command evidence, verification status, and unresolved risks.
