# Release Workflow

Status: required for the next release

Boulder releases must keep npm, GitHub tags, GitHub Releases, changelog entries, and evidence files aligned.

## Release Order

1. Update `package.json` version.
2. Update `CHANGELOG.md`.
3. Run `bun run ci`.
4. Run `npm pack --dry-run` or `npm_config_cache=/private/tmp/npm-cache-boulder npm pack --dry-run`.
5. Publish with npm 2FA.
6. Verify `npm view boulder-oss-cli name version`.
7. Verify install smoke from a fresh directory:

```bash
tmpdir=$(mktemp -d)
cd "$tmpdir"
bunx --no-cache boulder-oss-cli --help
```

8. Update `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt`.
9. Tag the exact commit used for the release.
10. Create or update the GitHub Release from the changelog entry.
11. Record GitHub Actions evidence in `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt`.

## Required Alignment

- npm version and `package.json` version match.
- Git tag points at the commit containing the release evidence.
- GitHub Release body links to `CHANGELOG.md`, install smoke, and CI evidence.
- `boulder product-readiness --json` returns `ready` in a clean release tree.
- `boulder service-readiness --json` returns `ready` in a clean release tree.

## Current Release Note

`boulder-oss-cli@0.1.7` is published and install-smoke verified. The next release should avoid rewriting the existing `v0.1.7` tag; use a new version and tag so npm, GitHub Release, and evidence point to the same commit.
