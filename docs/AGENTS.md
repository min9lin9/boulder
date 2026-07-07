# docs KNOWLEDGE BASE

Scope: `docs/`

## OVERVIEW

Documentation is product surface. Keep it aligned with actual CLI behavior and evidence files.

## WHERE TO LOOK

| Topic | Files |
| --- | --- |
| First-run/onboarding | `ONBOARDING.md`, `CONTRIBUTOR_START_HERE.md`, root `README.md` |
| Bootstrap profiles/interview | `BOOTSTRAP_PROFILE_RESEARCH.md`, `BOOTSTRAP_INTERVIEW_RESEARCH.md`, `BOULDER_CODEX_SKILL_USAGE.ko.md` |
| Capability source/doctor | `CAPABILITY_DOCTOR.md`, `GJC_LAZYCODEX_HANDOFF.md` |
| Architecture | `WORKFLOW_ARCHITECTURE.md`, `OPERATOR_WORKFLOW_STACK.md` |
| Product gates | `PRODUCT_READINESS.md`, `SERVICE_READINESS.md`, `RELEASE_WORKFLOW.md` |
| Evidence | `CASE_STUDIES/`, `APPLICATION_EVIDENCE.md`, `CODEX_OSS_FINAL_AUDIT.md` |

## CONVENTIONS

- Say what the CLI actually does today. Put future work in roadmap language.
- Separate recommendation, dry-run, doctor verification, and approval-gated use.
- For Korean docs, keep the user path short and concrete.
- Do not claim external tools are installed just because a profile recommends them.

## ANTI-PATTERNS

- No “auto-install” framing for candidates.
- No hidden external model calls.
- No doc-only greenwashing of failing gates.

## CHECKS

```bash
rg -n 'auto-install|automatically installs|Install or enable' docs README.md skills src
bun test test/source-cleanliness.test.ts
```
