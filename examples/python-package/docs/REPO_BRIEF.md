# Boulder Repo Brief: boulder-python-example

## Detected Surface

- README: yes
- package.json: no
- pyproject.toml: yes
- tests: none detected
- docs: none detected
- CI/config signals: none detected

## Likely Verification Commands

- python-package-check: `python -m pip check`

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
- No docs directory detected; maintainer workflow docs may need to be generated.
- No CI/config signals detected; release verification may be local-only.
- No required verification command inferred.
