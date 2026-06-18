# Onboarding

Status: published public CLI path

## Local Checkout Path

```bash
bun install
bun bin/boulder.ts --help
bun bin/boulder.ts quickstart --cwd examples/typescript-library
bun bin/boulder.ts onboard --cwd examples/typescript-library
bun bin/boulder.ts init --cwd examples/typescript-library --force
bun bin/boulder.ts inspect --cwd examples/typescript-library --json
bun bin/boulder.ts doctor --cwd examples/typescript-library --json
bun bin/boulder.ts pipeline --cwd examples/typescript-library --friction medium
bun bin/boulder.ts export --cwd examples/typescript-library --force
bun bin/boulder.ts product-readiness --json
bun bin/boulder.ts service-readiness --json
```

If `product-readiness` blocks in a future release, use the failed checks as the source of truth.

## Published Package Path

```bash
bunx boulder-oss-cli --help
bunx boulder-oss-cli quickstart --cwd <repo>
bunx boulder-oss-cli onboard --cwd <repo>
bunx boulder-oss-cli init --cwd <repo> --force
bunx boulder-oss-cli inspect --cwd <repo> --json
bunx boulder-oss-cli doctor --cwd <repo> --json
bunx boulder-oss-cli pipeline --cwd <repo> --friction medium
bunx boulder-oss-cli export --cwd <repo> --force
bunx boulder-oss-cli product-readiness --cwd <repo> --json
bunx boulder-oss-cli service-readiness --cwd <repo> --json
```

Use `quickstart` and `onboard` as aliases. Each command does not mutate the repository; they summarize current harness files, next commands, and the next docs to read.

Use `bunx` only after you trust the published npm package. Local Codex sessions should prefer the installed `boulder` skill or the local checkout wrapper.

## Success

A new maintainer should see repository-specific context, friction classification, exported workflow notes, and an honest readiness result within five minutes on a small repository.

## Common Failures

- Missing Bun: install Bun first.
- GJC/LazyCodex `configured-unverified`: keep them as adapter preferences until `doctor` finds local inventory evidence.
- Blocked product-readiness: inspect the failed checks and provide public evidence.
- Stale public evidence: regenerate readiness docs after replacing local paths with share-safe placeholders.
- External replay mismatch: refresh the target project official docs source before changing commands.
