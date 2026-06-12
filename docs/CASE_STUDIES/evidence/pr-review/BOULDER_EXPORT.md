# Boulder Export

This export packages repository context for Codex-ready OSS maintenance.

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


## Workflow Map

- issue-triage
- pr-review-prep
- release-planning
- dependency-review
- verification-gate

## Operator Workflow Stack

- superpowers: workflow-spine (required)
- gstack: review-gate (required)
- compound: learning-layer (required)

## Operator Pipeline

Boulder pipeline plan
- friction: medium
- stage: classification (required, standard)
- stage: deep-interview (required, standard)
- stage: pm-debate (required, standard, approval required)
- stage: synthesizer (required, standard)
- fail-closed: true

## Evidence Rule

Before claiming completion, attach command evidence, verification status, and unresolved risks.
