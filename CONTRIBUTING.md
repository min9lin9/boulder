# Contributing

`boulder` is early-stage. Contributions should preserve the operator contract:

- explicit context before action
- approval before risky execution
- evidence before claims
- verification before completion

## Local Development

```bash
bun install
bun test
bun run boulder --help
```

See [`docs/contributing/development-setup.md`](docs/contributing/development-setup.md) for the current local and CI-parity commands.

## Before Opening Work

- Open an issue first for large, risky, ambiguous, release-facing, or product-readiness changes.
- Keep pull requests small and focused.
- Do not include secrets, tokens, credentials, private repository content, or proprietary logs.
- Use ADRs for non-trivial scope or contract decisions.

## Pull Requests

Include:

- behavior summary
- commands run
- generated output changes
- unresolved risks

Also include docs impact, contract/check impact, rollback notes, and AI usage disclosure when relevant. See:

- [`docs/contributing/review-policy.md`](docs/contributing/review-policy.md)
- [`docs/contributing/ai-contribution-policy.md`](docs/contributing/ai-contribution-policy.md)
- [`GOVERNANCE.md`](GOVERNANCE.md)
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- [`docs/branch-protection.md`](docs/branch-protection.md)
