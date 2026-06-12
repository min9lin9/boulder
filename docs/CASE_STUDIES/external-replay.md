# External Replay Case Studies

Status: public replay fixtures with recorded transcripts

## Purpose

Boulder keeps public replay cases as fixtures so maintainers can test whether the workflow stays useful outside the Boulder repository.

## Targets

| Project | Why it matters | Boulder flow | Evidence fixture |
| --- | --- | --- | --- |
| `min9lin9/kimi-agent-swarm-skill` | Skill-package replay against an existing Codex-adjacent repo. | init, quickstart, inspect, doctor, pipeline, export | `docs/CASE_STUDIES/evidence/external-replay/kimi-agent-swarm-skill.txt` |
| `Yeachan-Heo/gajae-code` | Downstream planner/executor harness candidate for deep interview and execution evidence. | init, quickstart, inspect, doctor, high-friction pipeline, export | `docs/CASE_STUDIES/evidence/external-replay/gajae-code.txt` |
| `VoltAgent/awesome-codex-subagents` | Public Codex subagent catalog for compatibility and installation-doctor checks. | init, quickstart, inspect, doctor, medium-friction pipeline, export | `docs/CASE_STUDIES/evidence/external-replay/awesome-codex-subagents.txt` |

## Replay Rule

Read the target repository official docs first, then run Boulder commands. Boulder must not install agents, launch providers, publish packages, or mutate upstream repositories during replay.

`boulder replay-run --dry-run` produces the share-safe runbook from fixtures. It does not clone, install, publish, or mutate target repositories.

`doctor` may fail closed in replay transcripts when a target repository has no local capability inventory. That is expected; replay evidence records the boundary instead of inventing installed skills or MCP servers.
