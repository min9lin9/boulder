# Release Workflow

Status: required for the next release

Boulder releases must keep npm, GitHub tags, GitHub Releases, changelog entries, and evidence files aligned.

## Release Order

1. Update `package.json` version.
2. Update `CHANGELOG.md`.
3. Run `bun run ci`.
4. Run `bun bin/boulder.ts release-check --cwd . --json`.
5. Run `npm pack --dry-run` or `npm_config_cache=<temp-npm-cache> npm pack --dry-run`.
6. Publish with npm 2FA: `npm publish --access public`.
7. Verify `npm view boulder-oss-cli name version`.
8. Verify install smoke from a fresh directory:

```bash
tmpdir=$(mktemp -d)
cd "$tmpdir"
bunx --no-cache boulder-oss-cli --help
```

9. Update `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt`.
10. Tag the exact commit used for the release.
11. Create or update the GitHub Release from the changelog entry.
12. Record GitHub Actions evidence in `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt`.

## Required Alignment

- `package.json` has repo-verifiable npm page metadata:
  - `name`
  - `version`
  - `license`
  - `repository.url`
  - `homepage`
  - `bugs.url`
- `repository.url`, `homepage`, and `bugs.url` point at the same GitHub repository.
- Root `README.md` is current because npm renders it on the package page.
- npm version and `package.json` version match.
- Git tag points at the commit containing the release evidence.
- GitHub Release body links to `CHANGELOG.md`, install smoke, and CI evidence.
- `boulder product-readiness --json` returns `ready` in a clean release tree.
- `boulder service-readiness --json` returns `ready` in a clean release tree.

## Published Contents

The `files` allowlist ships `bin/`, `src/` (the launcher spawns `bun bin/boulder.ts`, so TypeScript sources are the runtime), `docs/`, `fixtures/`, `skills/`, and `packages/trace-ui/dist` — the built UI bundle that `boulder trace serve` resolves module-relative via `findStaticRoot`. The `packages/trace-ui` source tree is not packed. `fixtures/` stays packed because runtime commands resolve fixture paths and `fixtures/trace/` is the `trace doctor` baseline documented in `docs/trace/openclaw-admission.md`. Tests, `.omo/`, and `node_modules` are never packed. `prepack` runs `build:trace-ui` so `npm pack`/`npm publish` ship fresh UI assets; `bun pm pack` never runs lifecycle scripts, so `bun run ci` typechecks, builds, tests both suites, and explicitly rebuilds the bundle before its pack dry-run.

## Deferred External Provenance Hardening

`release-check` verifies repository files only. It must not block on npm account or package settings unless a maintainer supplies external evidence and asks Boulder to evaluate it.

Keep these as post-repo checklist items:

- npm account 2FA is required for publishing and package settings.
- npm token policy avoids long-lived publish tokens; prefer trusted publishing once configured.
- npm trusted publisher is configured on the npm package for the intended GitHub repository and workflow.
- Trusted publishing runs on a supported GitHub-hosted runner with the required Node and npm versions.
- Post-publish provenance is visible from npm package provenance views.
- Optional consumer checks are captured when used: `npm audit signatures`, registry signature verification, `npm sbom`, and any GitHub artifact attestation for non-npm release artifacts.

## Current Release Note

`boulder-oss-cli@0.1.16` is the current release candidate in this tree. The release evidence must keep npm version, Git tag `v0.1.16`, GitHub Release notes, CI run, package dry-run, and install smoke aligned before claiming product-ready status.

`release-check` is evidence automation only. It does not publish, tag, push, or create GitHub Releases.
