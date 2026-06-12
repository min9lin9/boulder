# Service Strategy Review

Status: planning supplement

Architecture reference: `docs/WORKFLOW_ARCHITECTURE.md`.

This review applies a product-growth lens to Boulder service readiness. It does not claim Lenny's Podcast endorsement; it uses common product review questions: who is the first user, what is the activation moment, why do they return, how does the loop distribute itself, and which metrics prove repeat use.

## Lenny MCP Evidence

Source: local `lennys-podcast-mcp-server` via HTTP MCP.

- Health check: 303 transcript episodes loaded.
- Available tools: `lennys_search_transcripts`, `lennys_get_episode`, `lennys_list_topics`.
- Relevant searches: activation/retention/growth loop, magic moment/onboarding/first value, product-led-growth topics, open-source topic.
- Follow-up search: `activation retention loop first value product led growth`.

Applied synthesis:

- Activation must be tied to first value and later retention, not a setup event.
- The service should be modeled as a loop, not a linear funnel.
- Product-led growth only applies if the product creates shareable artifacts in normal user work.
- Open-source distribution must be proven through public maintainer artifacts, not assumed from repository visibility.

## Lenny MCP Re-Review

Verdict: Boulder has reached a strong `fixture-backed service plan`, but not a fully field-proven repeatable service.

The Lenny-style bar is stricter than "the CLI can produce readiness output." The useful unit is a loop:

```text
maintainer event -> first value -> shared artifact -> decision -> second event -> changed recommendation
```

Boulder now has executable evidence for that loop through `fixtures/service-readiness/gates.json`. That raises planning confidence, but the service is still not field-backed because the evidence is not yet produced by a real maintainer using Boulder across multiple repo events.

Planning score remains 90 / 100:

- + executable gates now prevent vague service claims
- + activation, repeat-run, share-safety, decision-impact, replay, and metrics are machine-checkable
- - no live maintainer activation transcript yet
- - no public issue/PR/release link proving artifact distribution
- - no same-maintainer second-run retention proof
- - no generated readiness-delta artifact replacing the fixture-backed repeat-run claim

Architecture planning score: 94 / 100 after the approved three-stage MVP remediation is written into `docs/WORKFLOW_ARCHITECTURE.md`.

The service score remains lower than the architecture score until Contract MVP, Handoff MVP, and Field Evidence MVP are implemented and evidenced.

## Current Verdict

Boulder is `pilot-ready` as a service workflow foundation. It is not yet public `ready` because product-readiness remains blocked by release/public evidence, and the service loop has not yet been proven by external repeat use.

Practical service planning score: 90 / 100.

Interpretation:

- The workflow is coherent enough for maintainer pilots.
- The service claim is stronger because activation, repeat value, public artifact quality, decision impact, replay discipline, and metrics now have an executable evidence fixture.
- The next planning target is not more broad capability; it is real external maintainer usage that produces evidence outside local fixtures.

## Service Acceptance Gates

Boulder can claim repeatable public service readiness only when these gates pass:

| Gate | Required Evidence | Current State |
| --- | --- | --- |
| activation-gate | first readiness delta created within 15 minutes | fixture-backed |
| repeat-run-gate | second run produces a changed recommendation after repo evidence changes | fixture-backed |
| share-safe-gate | public artifact has no local paths, secrets, private repo assumptions, or unsupported claims | fixture-backed |
| decision-impact-gate | maintainer records merge, reject, defer, or request-changes outcome | fixture-backed |
| external-replay-gate | public OSS replay uses official docs first and produces shareable evidence | fixture-backed |
| metrics-gate | service metrics are generated from evidence, not hand-written docs | fixture-backed |

Executable evidence source: `fixtures/service-readiness/gates.json`.

## Field-Backed Upgrade Plan

The next planning target is to replace fixture-backed proof with field-backed proof without adding a hosted product.

| Upgrade | Current Evidence | Required Field Evidence |
| --- | --- | --- |
| activation | `activationGate.timeToFirstReadinessDeltaMinutes` fixture | timestamped first-run transcript from a real repo |
| retention | `repeatRunGate.changedRecommendations` fixture | second run on the same repo after a real PR/release/support event |
| distribution | `shareSafeGate.checkedArtifactPaths` fixture | public issue, PR, release, or case-study URL containing Boulder output |
| decision impact | `decisionImpactGate.outcomes` fixture | maintainer decision log tied to a concrete artifact |
| replay | `externalReplayGate.publicTarget` fixture | fresh replay against a public OSS target after official docs refresh |
| metrics | `metricsGate.generatedFromEvidence` fixture | generated metrics report derived from evidence files |

Field-backed readiness can still be CLI-only. The requirement is not a hosted dashboard; it is real-world evidence that survives outside local development.

## First User

Primary ICP:

- solo or small-team public OSS maintainers
- already using Codex or other AI coding tools
- receive AI-assisted issues, PRs, or release work
- need evidence before merging or publishing

Secondary ICP:

- maintainers evaluating a public OSS repo before contributing
- agent workflow builders who need a reproducible handoff contract

## Activation Moment

The activation moment is:

> Within 15 minutes, Boulder produces a repo-specific readiness/risk report and a next-action list that the maintainer can paste into an issue, PR, or release checklist.

Activation is not `boulder init`. Activation is when the user sees a concrete gap they did not have to infer manually.

The measurable activation event should be `first-readiness-delta-created`, not `command-ran`. A user who runs Boulder and receives only static setup files has not activated.

## Repeat Triggers

Boulder should be used again when:

- a new AI-assisted PR arrives
- a release is being prepared
- a public OSS replay target is attached
- product-readiness changes from blocked to less blocked
- official docs for a replay target change
- GJC/LazyCodex handoff evidence changes
- support issue quality needs triage

## Retention Loop

```text
new repo event -> boulder inspect/pipeline -> official docs/replay check -> handoff validation -> readiness delta -> issue/PR/release evidence -> next repo event
```

The retention asset is the evidence delta, not the generated docs themselves.

If two consecutive runs produce no delta, no public artifact, and no next action, Boulder is behaving like a one-time scaffold rather than a repeatable service.

## Distribution Motion

Boulder should spread through artifacts maintainers already share:

- issue comments with `service-readiness` output
- PR descriptions with handoff validation evidence
- release checklists with product-readiness deltas
- public case-study replay reports
- official-docs optimization notes for attached public OSS targets

Distribution should not rely on a hosted dashboard before CLI evidence is repeatable.

The wedge is not "AI project management." The wedge is "maintainer-grade proof that AI-assisted work is safe enough to review, hand off, or reject."

## Metrics Ladder

| Stage | Metric | What It Proves | Not Allowed To Claim |
| --- | --- | --- | --- |
| Activation | time-to-first-readiness-delta | user reached the first useful outcome | adoption |
| Replay | official-docs-coverage | public OSS replay is source-backed | correctness of target project |
| Handoff | handoff validity | GJC/LazyCodex artifacts are usable | executor quality |
| Retention | readiness delta count | repeated use across repo events | user retention without real users |
| Distribution | public evidence link count | artifacts are shareable | market traction |
| Support | issue quality rate | external contributors can report useful failures | support SLA |

## Missing Work

- Replace the current fixture-backed first-run proof with an actual first-run transcript that measures time-to-first-readiness-delta.
- Replace the current fixture-backed repeat-run proof with generated readiness delta output so repeated runs show what changed.
- Add public evidence link templates for issues, PRs, and releases.
- Add official-docs refresh policy for replay targets.
- Add support triage metrics based on issue template completeness.
- Replace fixture-backed public artifact proof with real public issue, PR, release, or replay links.
- Replace fixture-backed maintainer decision proof with a real maintainer decision log.
- Add a `field-readiness` packet that bundles activation transcript, repeat-run delta, share-safe artifact URL, decision outcome, replay evidence, and generated metrics into one reviewable folder.
- Add `boulder doctor` so installed Codex skills, MCP servers, plugins, and runtime blockers are visible before planner/executor selection.
- Add a rule that Boulder cannot raise the planning score above 92 until at least one external maintainer or clean-room repo run produces all field evidence.

## Decision

Boulder should call the current level `service-pilot-ready`, not `service-ready`, until:

- public product-readiness blockers are cleared
- one external replay is actually executed against a public target
- service metrics are generated from evidence, not only defined in docs
- at least one shared public artifact proves the loop outside local development
- at least one repeat-run delta proves ongoing value after the first run
