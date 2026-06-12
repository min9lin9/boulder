# Trust, Support, and Security

Status: public maintainer posture

Boulder is a local Codex OSS maintainer workflow kit. This page defines the public support, security, evidence, and rollback boundaries reviewers can inspect before trusting the project.

## Support Channels

Support channels are intentionally public and maintainer-readable:

- GitHub Issues for bugs, reproducible CLI failures, documentation gaps, and support questions.
- GitHub Pull Requests for implementation changes, fixture updates, and documentation corrections.
- GitHub Discussions may be added later for usage patterns, but Issues remain the canonical support channel until then.

## Maintainer Response

Maintainer response is best-effort and evidence-first:

- A useful issue should include the command, expected behavior, actual output, Boulder version, operating system, and a minimal repository shape when possible.
- A useful PR should include verification output or explain why a check cannot be run.
- Security-sensitive reports should not include secrets, private repository content, tokens, credentials, or proprietary logs.

## Security Policy

Security policy is documented in `SECURITY.md` and summarized here:

- Boulder is not a scanner for repositories the operator does not own or administer.
- Boulder does not require credential access to generate local harness artifacts.
- External provider output is advisory until validated locally.
- Protected files and secrets must not be sent to external providers.

## Responsible Disclosure

Responsible disclosure should start with a minimal GitHub issue that does not expose secrets or private data. If the report requires private details, open a public issue with a non-sensitive summary and ask for a private handoff path.

The report should include:

- affected command or generated artifact
- minimal reproduction steps
- expected and actual security boundary
- whether credential access, provider launch, or protected files were involved

## Public Evidence

Public evidence is kept in repository files instead of opaque hosted dashboards:

- `README.md` for quickstart, scope, status, and public evidence links
- `docs/CODEX_OSS_APPLICATION_PACKET.md` for the Codex OSS submission evidence map
- `docs/CODEX_OSS_SCORECARD.md` for the application rubric
- `docs/CASE_STUDIES/` for PR review, release workflow, and core implementation examples
- `docs/GJC_LAZYCODEX_HANDOFF.md` for GJC planning to LazyCodex implementation boundaries
- `docs/PRODUCT_READINESS.md` for the local product-readiness gate result
- `.omo/ulw-loop/evidence/codex-oss-9-5/` for local execution evidence

## License

Boulder is intended to be published as open source under the repository license. Reviewers should inspect the root `LICENSE` file before reuse or redistribution.

## Boundary Terms

Boulder keeps these boundaries explicit:

- No credential access: Boulder should not need API keys, provider tokens, SSH keys, or private registry credentials for its core local harness workflow.
- No provider launch: Boulder may describe provider-aware policy, but it does not autonomously start external model providers.
- Local verification only: `boulder verify` may run maintainer-declared local verification commands from `boulder.yaml`; this is not a provider launch path and must remain reviewable in the manifest diff.
- No hosted service claim: Boulder is a local CLI and documentation workflow, not a hosted SaaS product.
- Manual publish: Release planning may validate evidence, but package publishing and release tagging remain human-controlled.
- Rollback: Generated files are plain repository files, so maintainers can review diffs, revert changes, or regenerate artifacts from the CLI.
- dirty tree: Boulder must assume a dirty tree can contain user work; implementation agents must not discard unrelated changes.

## Rollback Practice

Rollback is repository-native:

- inspect generated files before merge
- keep generated docs and fixtures in reviewable commits
- use `git diff` and CI before release
- revert or regenerate only the files tied to the failed workflow

This posture keeps Boulder useful for Codex-heavy OSS workflows without pretending to replace maintainer judgment, local verification, or project-specific security review.
