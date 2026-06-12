# Onboarding

Status: pre-publish path

## Pre-Publish Local Path

```bash
bun install
bun bin/boulder.ts --help
bun bin/boulder.ts init --cwd examples/typescript-library --force
bun bin/boulder.ts inspect --cwd examples/typescript-library --json
bun bin/boulder.ts pipeline --cwd examples/typescript-library --friction medium
bun bin/boulder.ts export --cwd examples/typescript-library --force
bun bin/boulder.ts product-readiness --json
```

`product-readiness` may be blocked before public release evidence exists. That is expected and should not be hidden.

## Post-Publish Path

Keyword: post-publish.

```bash
bunx boulder-oss-cli --help
bunx boulder-oss-cli init --cwd <repo> --force
bunx boulder-oss-cli inspect --cwd <repo> --json
bunx boulder-oss-cli pipeline --cwd <repo> --friction medium
bunx boulder-oss-cli export --cwd <repo> --force
```

## Success

A new maintainer should see repository-specific context, friction classification, exported workflow notes, and an honest readiness result within five minutes on a small repository.

## Common Failures

- Missing Bun: install Bun first.
- Blocked product-readiness: inspect the failed checks and provide public evidence.
- External replay mismatch: refresh the target project official docs source before changing commands.
