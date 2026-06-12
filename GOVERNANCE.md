# Governance

Status: initial maintainer governance

Boulder is currently maintained by the repository owner. Governance is intentionally lightweight until there are multiple regular maintainers.

## Roles

### Project Lead

The project lead owns scope, release readiness, final merge decisions, security escalation, and public claims.

### Maintainer

Maintainers review issues and pull requests, keep CI green, protect the product-readiness gate, and decide whether changes fit the roadmap.

### Reviewer

Reviewers may give technical feedback, request tests, ask for smaller scope, and block changes that lack evidence.

### Contributor

Contributors propose issues, submit pull requests, document behavior, and provide verification evidence.

## Decision Process

- Small bug fixes and docs corrections may proceed directly through a pull request.
- Larger features, risky refactors, security-sensitive changes, and product-readiness changes should start with an issue or ADR.
- Decisions should be recorded in GitHub issues, pull requests, ADRs, or release notes.
- Discord or chat discussion is not a decision record until summarized in GitHub or an ADR.

## Merge Policy

- `main` should be protected by pull request review and required status checks.
- CODEOWNERS review is expected for protected paths.
- A merge should include tests or a clear explanation for docs-only changes.
- AI-assisted changes are allowed only when a human can explain the change and provide evidence.

## Security Escalation

Security-sensitive reports follow `SECURITY.md` and `docs/TRUST_SUPPORT_SECURITY.md`. Do not post secrets, credentials, tokens, or private repository content in public issues.
