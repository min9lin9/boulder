# Codex OSS Final Audit

Status: local 9.5+ readiness audit

Official source: https://developers.openai.com/community/codex-for-oss accessed 2026-06-11.

This audit decides whether Boulder has enough public evidence to submit as a Codex-heavy OSS maintainer workflow project. It is not an OpenAI acceptance guarantee.

## Go Decision

Decision: GO for submission preparation with public npm install smoke and GitHub Actions evidence available.

Local readiness: 9.56 / 10.

Weighted score: 95.65 / 100.

Public product readiness: blocked until the current package version has matching local/pushed tag evidence. The published install smoke is recorded, but `release-check` currently reports `git-tag-local=missing local tag v0.1.14`.

## Final Local Readiness

| Dimension | Weight | Score | Evidence map |
| --- | ---: | ---: | --- |
| Official program fit | 20 | 9.6 | `docs/CODEX_OSS_APPLICATION_PACKET.md` maps pull request review, maintainer automation, release workflow, and core OSS work to Boulder evidence. |
| Public OSS credibility | 15 | 9.5 | `README.md`, `LICENSE`, `docs/APPLICATION_EVIDENCE.md`, `docs/TRUST_SUPPORT_SECURITY.md`, and package name `boulder-oss-cli`. |
| Repeatable workflow proof | 20 | 9.5 | `docs/CASE_STUDIES/pr-review.md`, `docs/CASE_STUDIES/release-workflow.md`, and `docs/CASE_STUDIES/core-implementation.md`. |
| Codex-specific value | 15 | 9.6 | `docs/GJC_LAZYCODEX_HANDOFF.md`, `docs/CASE_STUDIES/evidence/core-implementation/gjc-plan.md`, and `docs/CASE_STUDIES/evidence/core-implementation/lazycodex-implementation-summary.md`. |
| Product readiness | 10 | 9.1 | `docs/PRODUCT_READINESS.md`, `src/product-readiness.ts`, `docs/RELEASE_PLAN.md`, and `.omo/ulw-loop/evidence/codex-oss-9-5/`. Public-ready remains blocked by missing `v0.1.14` tag evidence. |
| Safety and boundaries | 10 | 9.7 | `docs/TRUST_SUPPORT_SECURITY.md`, `docs/PROVIDER_POLICY.md`, `SECURITY.md`, and no hosted service or provider-launch claim. |
| Narrative quality | 10 | 9.5 | `docs/CODEX_OSS_APPLICATION_PACKET.md` is claim-to-evidence mapped and keeps limitations visible. |

## Hard Gate Review

No hard blocker remains for local candidate application-readiness:

- CLI version and `package.json` version are `0.1.14`.
- Package dry run excludes duplicate `* 2.*` artifacts by package manifest policy.
- Public GitHub Actions evidence is fixed in `docs/CASE_STUDIES/evidence/release-workflow/github-actions.txt`.
- Published install smoke evidence is fixed in `docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt` and records a successful `bunx boulder-oss-cli --help` run.
- M9 export/release evidence is present through generated export docs and release-plan evidence.
- Product-readiness passes in a clean release tree with public install smoke evidence present.
- Three case studies exist and include commands, artifacts, operator conclusions, and limitations.
- Public trust/support/security posture is documented.
- Core Boulder commands remain local and do not require credential access.
- Boulder makes no provider launch, hosted service, benchmark leadership, acceptance, runtime scale, or external adoption claim.

Public release completion remains pending until the maintainer creates and pushes the matching Git tag, publishes the package version, and records the GitHub Release evidence.

Public service-ready cannot yet be claimed because `product-readiness --json` is blocked by missing tag evidence. The service loop remains pilot-ready: onboarding, replay, handoff, support, metrics, and field evidence pass, while public product readiness is still gated.

## Public Product Readiness

`boulder product-readiness --json` is the source of truth for the public product gate.

Current public blockers:

- None for the packaged CLI readiness gate in a clean release tree.

Already evidenced:

- GitHub Actions CI success run is recorded.
- Published baseline and candidate install smoke evidence succeeds for `boulder-oss-cli`, with `0.1.14` candidate tarball smoke recorded.
- GitHub Issue Forms provide public bug, feature, AI contribution, and documentation support routes.
- Public case studies, GJC planning evidence, LazyCodex handoff evidence, and trust/security posture are present.

## Submission Packet

Submission packet files:

- `README.md`
- `docs/APPLICATION_EVIDENCE.md`
- `docs/CODEX_OSS_SCORECARD.md`
- `docs/CODEX_OSS_APPLICATION_PACKET.md`
- `docs/CODEX_OSS_FINAL_AUDIT.md`
- `docs/TRUST_SUPPORT_SECURITY.md`
- `docs/GJC_LAZYCODEX_HANDOFF.md`
- `docs/PRODUCT_READINESS.md`
- `docs/CASE_STUDIES/`

## Does Not Claim

Boulder does not claim:

- OpenAI acceptance
- existing Codex Security access
- hosted service availability
- benchmark leadership
- runtime scale
- external OSS adoption
- autonomous provider execution
- credential access

## Blocked Below 9.0 If Regressed

The score must be lowered below 9.0 if any of these become true:

- package version and CLI version drift
- duplicate copy artifacts re-enter the package dry run
- fewer than three public case studies remain
- product-readiness no longer blocks missing GJC/LazyCodex evidence
- public support/security posture is removed
- core commands add provider SDK calls, credential prompts, or external runtime launch
- application packet claims acceptance, adoption, runtime scale, hosted service availability, or security access

## Manual Publish and Rollback

Manual publish remains outside Boulder automation. Release tags, npm publish, GitHub release creation, and submission are maintainer actions.

Rollback is repository-native:

- inspect generated docs before merge
- use `git diff` before submission
- rerun `bun run ci`
- revert only the specific workflow artifacts that regressed

## Final Review Notes

The final public narrative is strong enough for submission because Boulder argues a narrow product:

Boulder is an evidence-backed operator kit for maintainers who use Codex heavily and need repeatable context, planning gates, implementation handoff, verification, release evidence, and honest limitations.

The remaining future work is not a blocker for submission:

- live GJC/LazyCodex runtime scale
- real external maintainer adoption history
- deeper PR-diff case studies against active public repositories
- optional hosted artifact viewer
