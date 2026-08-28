# Boulder Developer Guide

> **Entry point** for humans and AI coding agents working on this repository.
> Owner: project maintainers. Rule: any PR that adds, removes, renames, or substantially changes a developer-facing doc must update this file in the same PR.
> This is an *initial navigation layer* - validated against three canonical tasks (set up locally / review an AI contribution / understand the service loop); treat re-routing as normal maintenance.

## Canonical sources

| Topic | Canonical source |
| --- | --- |
| User install & first run | [README Quickstart](../README.md#readme) |
| Local dev environment | [contributing/development-setup.md](contributing/development-setup.md) |
| Contribution rules | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Review expectations | [contributing/review-policy.md](contributing/review-policy.md) |
| AI contribution policy | [contributing/ai-contribution-policy.md](contributing/ai-contribution-policy.md) |
| Scoped AI-agent instructions | nearest `AGENTS.md` by path (see AI section below) |

Do not duplicate a canonical source's content elsewhere - link it.

## Start here

Install and first run are documented once, in [README Quickstart](../README.md#readme). Come back here afterwards; everything below assumes the local setup from [contributing/development-setup.md](contributing/development-setup.md).

## Routes by role

| If you are... | Your task | Start here | Then read |
| --- | --- | --- | --- |
| New contributor | first contribution | [CONTRIBUTOR_START_HERE.md](CONTRIBUTOR_START_HERE.md) | [CONTRIBUTING.md](../CONTRIBUTING.md), [contributing/review-policy.md](contributing/review-policy.md) |
| Local developer | build/test locally | [contributing/development-setup.md](contributing/development-setup.md) | [ONBOARDING.md](ONBOARDING.md) |
| Reviewer | evaluate a PR | [contributing/review-policy.md](contributing/review-policy.md) | [contributing/ai-contribution-policy.md](contributing/ai-contribution-policy.md) |
| AI-assisted contributor | work via coding agents | [AI-assisted contribution routing](#ai-assisted-contribution-routing) | [contributing/ai-contribution-policy.md](contributing/ai-contribution-policy.md) |
| Maintainer / releaser | cut a release | [MAINTAINER_WORKFLOWS.md](MAINTAINER_WORKFLOWS.md) | [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) |
| Operator | run the service loop | [SERVICE_LOOP.md](SERVICE_LOOP.md) | [OPERATOR_WORKFLOW_STACK.md](OPERATOR_WORKFLOW_STACK.md) |
| Architecture reader | understand the pipeline | [WORKFLOW_ARCHITECTURE.md](WORKFLOW_ARCHITECTURE.md) | Architecture-to-code map below |

## AI-assisted contribution routing

These files are instructions for AI-assisted work and scoped repository behavior; they do not replace [CONTRIBUTING.md](../CONTRIBUTING.md).

Precedence when working with an AI coding agent:

1. Root-level policies first: [CONTRIBUTING.md](../CONTRIBUTING.md) and [contributing/ai-contribution-policy.md](contributing/ai-contribution-policy.md).
2. Then the nearest `AGENTS.md` governing the directory you edit: [`src/AGENTS.md`](../src/AGENTS.md) (src tree), [`test/AGENTS.md`](../test/AGENTS.md) (test tree), [`docs/CASE_STUDIES/AGENTS.md`](CASE_STUDIES/AGENTS.md) (case studies), plus subsystem files (`src/v2/AGENTS.md`, `src/k2a-f/AGENTS.md`, `skills/AGENTS.md`, `examples/AGENTS.md`) when entering those areas.

## Architecture-to-code quick map

Full narrative lives in [WORKFLOW_ARCHITECTURE.md](WORKFLOW_ARCHITECTURE.md). Landing points in source:

- CLI dispatch -> `src/cli.ts`; ops verbs -> `src/cli-ops-command.ts`
- Planner stack -> `src/planner-router.ts`, `src/planning-packet.ts`, `src/plan-store.ts`
- Gated kernels -> `src/v2/`, `src/k2a-f/` (read their `AGENTS.md` before editing)
- Gates -> `src/release-check.ts`, `src/replay-check.ts`, `src/service-readiness.ts`

TODO(owner: maintainers): expand this map per pipeline stage as WORKFLOW_ARCHITECTURE.md is reconciled with current sources.

## Publishing & versioning

Release steps live in [MAINTAINER_WORKFLOWS.md](MAINTAINER_WORKFLOWS.md) and [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md); readiness gates are covered by [PRODUCT_READINESS.md](PRODUCT_READINESS.md). Known gap: npm registry doc-registry entries may lag the published version until the next release bundle regenerates them.

## Evidence-format spec

The draft interop spec lives at [spec/evidence-format/SPEC.md](../spec/evidence-format/SPEC.md) with JSON schemas alongside.

## Docs map

| Doc | One-line purpose |
| --- | --- |
| [CONTRIBUTOR_START_HERE.md](CONTRIBUTOR_START_HERE.md) | shortest path for external contributors (now routes through this file) |
| [contributing/development-setup.md](contributing/development-setup.md) | local environment + CI-parity commands |
| [contributing/ai-contribution-policy.md](contributing/ai-contribution-policy.md) | rules for AI-generated changes |
| [contributing/review-policy.md](contributing/review-policy.md) | how PRs are reviewed |
| [ONBOARDING.md](ONBOARDING.md) | non-developer onboarding path |
| [MAINTAINER_WORKFLOWS.md](MAINTAINER_WORKFLOWS.md) | maintainer release/workflow routines |
| [OPERATOR_WORKFLOW_STACK.md](OPERATOR_WORKFLOW_STACK.md) | operator-facing workflow stack |
| [SERVICE_LOOP.md](SERVICE_LOOP.md) | packaged local service loop |
| [WORKFLOW_ARCHITECTURE.md](WORKFLOW_ARCHITECTURE.md) | pipeline architecture narrative |

## Maintaining this file

Update this document in the same PR whenever a routed doc is renamed, moved, deprecated, or a new developer-facing doc lands. Link targets are verified manually before merge; a follow-up `docs:check-links` automation is tracked as an improvement.

---

Hypothesis traceability: H1 (role-routed entry, SUPPORTED) -> Routes table + Start here; H2 (AGENTS routing, supported-as-risk) -> AI section + Canonical sources; H3 partial (link-only quickstart) -> Start here links instead of repeating commands.
