# AI Contribution Policy

Status: active

AI use is allowed. Unexplained AI-generated code, broad speculative rewrites, and unverified claims are not.

## Required Disclosure

AI-assisted issues and pull requests should state:

- AI tool or model used
- human explanation of the change
- affected files and behavior
- tests and manual QA evidence
- risk and rollback notes

## Allowed

- Small bug fixes with reproduction steps and tests.
- Documentation corrections backed by code, command output, or public evidence.
- Fixture or example updates with deterministic verification.
- Planning and review assistance when the final change is human-explained.

## Caution

- Refactors that touch multiple modules.
- Product-readiness, release, or package changes.
- Security-sensitive paths.
- Changes to provider policy, protected paths, or verification commands.

These should be small, issue-linked, and reviewed against tests and docs.

## Rejected

- Broad AI rewrites without an issue or plan.
- Changes the author cannot explain.
- Tests or docs invented after the fact to justify behavior.
- Security or credential changes without threat model and maintainer review.
- Claims of adoption, acceptance, runtime scale, or published release without public evidence.

## Human Responsibility

The contributor owns the result. If a reviewer asks why a change is correct, "the model said so" is not an acceptable answer.
