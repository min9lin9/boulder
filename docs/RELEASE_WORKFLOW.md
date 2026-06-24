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

- npm version and `package.json` version match.
- Git tag points at the commit containing the release evidence.
- GitHub Release body links to `CHANGELOG.md`, install smoke, and CI evidence.
- `boulder product-readiness --json` returns `ready` in a clean release tree.
- `boulder service-readiness --json` returns `ready` in a clean release tree.

## Current Release Note

`boulder-oss-cli@0.1.15` is the current release candidate in this tree. The release evidence must keep npm version, Git tag `v0.1.15`, GitHub Release notes, CI run, package dry-run, and install smoke aligned before claiming product-ready status.

`release-check` is evidence automation only. It does not publish, tag, push, or create GitHub Releases.
