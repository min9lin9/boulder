# Operating Metrics

Status: pilot definitions

These metrics describe service workflow health. They are not adoption claims.

| Metric | Numerator | Denominator | Source |
| --- | --- | --- | --- |
| Activation | onboarding runs with export evidence | onboarding attempts | `.omo/ulw-loop/evidence/`, `docs/ONBOARDING.md` |
| Onboarding success | successful five-minute onboarding transcripts | onboarding transcripts | `.omo/ulw-loop/evidence/service-level-workflow/` |
| Replay success | replay manifests with evidence | replay manifests | `fixtures/replay/`, `docs/EXTERNAL_REPLAY.md` |
| Handoff validity | valid low/medium/high handoff artifacts | handoff artifacts | `fixtures/handoffs/` |
| official-docs-coverage | replay targets with official docs evidence | public OSS replay targets | `fixtures/replay/*/official-docs.json` |
| Readiness pass rate | passing readiness checks | all readiness checks | `product-readiness`, `service-readiness` |
| Support intake | issues with command, evidence, expected, actual | service-related issues | `.github/ISSUE_TEMPLATE/` |
| Time-to-evidence | completed evidence timestamps | started workflows | evidence transcripts |
| time-to-first-readiness-delta | first readiness delta produced in under 15 minutes | first-run onboarding attempts | onboarding transcript plus readiness output |
| readiness delta count | repeated readiness outputs with changed checks | repo events that trigger Boulder | service-readiness and product-readiness outputs |
| public evidence link count | issue, PR, release, or replay links containing Boulder evidence | shareable Boulder artifacts | GitHub issues, PRs, releases, case studies |

## Guardrail

Do not report users acquired, adoption proven, market traction, or runtime scale proven unless independent public data exists.

Each metric must state its numerator, denominator, and source before it can be used in a service-readiness claim.

## Observed Evidence Template

The supplemental template lives at `fixtures/service-readiness/metric-log-template.json`. It is non-authoritative scaffolding for repeat-use logs, not adoption evidence by itself.

Required fields:

- `runId`
- `actorType`: `maintainer` or `external-non-maintainer`
- `boulderVersion`
- `targetRepo`
- `startedAt`
- `completedAt`
- `commands`
- `readinessBefore`
- `readinessAfter`
- `readinessDelta`
- `publicEvidenceUrl`
- `shareSafe`
- `limitations`

Readiness or adoption claims still require `boulder record field-readiness` and the canonical `evidence/field-readiness/<run-id>/generated-metrics.json` manifest flow.

## Product Interpretation

- Activation is proven by time-to-first-readiness-delta, not by installation.
- Retention is proven by repeated readiness deltas across repo events, not by generated file count.
- Distribution is proven by public evidence links, not by private local transcripts.
- Official-docs-coverage is required before optimizing a public OSS replay.
