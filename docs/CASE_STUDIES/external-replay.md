# External Replay Case Studies

Status: planned public replay fixtures

## Purpose

Boulder keeps public replay cases as fixtures so maintainers can test whether the workflow stays useful outside the Boulder repository.

## Targets

| Project | Why it matters | Boulder flow | Evidence fixture |
| --- | --- | --- | --- |
| `min9lin9/kimi-agent-swarm-skill` | Skill-package replay against an existing Codex-adjacent repo. | inspect, pipeline, export | `fixtures/replay/kimi-agent-swarm-skill/replay.json` |
| `Yeachan-Heo/gajae-code` | Downstream planner/executor harness candidate for deep interview and execution evidence. | inspect, high-friction pipeline, doctor, export | `fixtures/replay/gajae-code/replay.json` |
| `VoltAgent/awesome-codex-subagents` | Public Codex subagent catalog for compatibility and installation-doctor checks. | inspect, medium-friction pipeline, doctor, export | `fixtures/replay/awesome-codex-subagents/replay.json` |

## Replay Rule

Read the target repository official docs first, then run Boulder commands. Boulder must not install agents, launch providers, publish packages, or mutate upstream repositories during replay.

