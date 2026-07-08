# Codex OSS Application Packet

Status: draft application evidence map

Official source: https://developers.openai.com/community/codex-for-oss accessed 2026-06-11.

## Project

Boulder is an evidence-backed Codex OSS maintainer workflow kit.

Repository evidence:

- `README.md`
- `docs/APPLICATION_EVIDENCE.md`
- `docs/CODEX_OSS_SCORECARD.md`
- `docs/GJC_LAZYCODEX_HANDOFF.md`
- `docs/TRUST_SUPPORT_SECURITY.md`
- `docs/CODEX_OSS_FINAL_AUDIT.md`

## Maintainer Problem

OSS maintainers using Codex need repeatable context, approval boundaries, verification gates, release evidence, and unresolved-risk reporting before they hand work to an agent.

Boulder packages that context into local CLI-generated artifacts while keeping maintainers in control.

## Codex Usage Map

| Official Codex for OSS category | Boulder claim | Current evidence | Gap before final submission |
| --- | --- | --- | --- |
| pull request review | Boulder prepares repo briefs, protected paths, provider policy, verification gates, and Codex workflow notes for safer PR review. | `docs/APPLICATION_EVIDENCE.md`, `docs/CASE_STUDIES/pr-review.md`, `docs/CASE_STUDIES/evidence/pr-review/BOULDER_EXPORT.md` | Public fixture evidence is present; a real PR-diff variant remains a post-submission strengthening item. |
| maintainer automation | Boulder automates maintainer context packaging, workflow stack checks, provider approval boundaries, benchmark fixtures, scorecards, release-plan checks, and product-readiness checks. | `README.md`, `docs/APPLICATION_EVIDENCE.md`, `docs/CODEX_OSS_SCORECARD.md`, `docs/TRUST_SUPPORT_SECURITY.md`, `src/product-readiness.ts` | Public trust/support/security posture is documented; external maintainer support history remains future evidence. |
| release workflow | Boulder checks release-facing evidence, keeps publishing manual, verifies package scripts, and now requires pipeline planning evidence. | `docs/CASE_STUDIES/release-workflow.md`, `docs/CASE_STUDIES/evidence/release-workflow/release-evidence-plan.json`, `docs/CASE_STUDIES/evidence/release-workflow/ci.txt` | Publish/tag steps remain manual by design. |
| core OSS work | Boulder routes higher-risk implementation through `classification -> Deep Interview -> PM debate -> Synthesizer -> CSO/QA`, then uses GJC for planning/review and LazyCodex for implementation handoff. | `docs/CASE_STUDIES/core-implementation.md`, `docs/CASE_STUDIES/evidence/core-implementation/gjc-plan.md`, `docs/CASE_STUDIES/evidence/core-implementation/lazycodex-implementation-summary.md` | Runtime scale and live executor telemetry remain future benchmark work. |

## Evidence Position

Boulder does not ask reviewers to trust a broad agent-runtime claim. It shows local, inspectable evidence:

- generated maintainer context in `docs/BOULDER_EXPORT.md`
- workflow contract in `docs/OPERATOR_WORKFLOW_STACK.md`
- provider boundary in `docs/PROVIDER_POLICY.md`
- release boundary in `docs/RELEASE_PLAN.md`
- application-readiness rubric in `docs/CODEX_OSS_SCORECARD.md`
- GJC to LazyCodex handoff contract in `docs/GJC_LAZYCODEX_HANDOFF.md`
- support/security posture in `docs/TRUST_SUPPORT_SECURITY.md`
- product-readiness gate in `src/product-readiness.ts`
- final local readiness audit in `docs/CODEX_OSS_FINAL_AUDIT.md`
- three public case studies under `docs/CASE_STUDIES/`

## Limitations

Does not claim:

- OpenAI acceptance
- existing Codex Security access
- hosted service availability
- benchmark leadership
- runtime scale
- external OSS adoption
- autonomous provider execution

Still not proven:

- live GJC/LazyCodex runtime scale
- external OSS adoption outside Boulder
- OpenAI review outcome

## Ask

Use Boulder as the public evidence harness for a Codex-heavy OSS maintainer workflow application. The final submission can use `docs/CODEX_OSS_FINAL_AUDIT.md` as the local go/no-go record; OpenAI acceptance remains outside Boulder claims.
