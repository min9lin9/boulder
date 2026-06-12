# External Replay

Status: pilot workflow

External replay repeats the Boulder service loop against a public OSS target. A replay must read official documentation first, then choose setup, test, replay, and handoff commands from those sources.

## Rule

Public OSS target attached -> official docs first -> optimized replay manifest -> handoff recommendation -> evidence.

Do not rely on memory, third-party tutorials, or guessed commands when official documentation is available.

## Current Pilot Target

- Project: `kimi-agent-swarm-skill`
- Repository: `https://github.com/min9lin9/kimi-agent-swarm-skill`
- Official docs source: `fixtures/replay/kimi-agent-swarm-skill/official-docs.json`
- Replay manifest: `fixtures/replay/kimi-agent-swarm-skill/replay.json`

## Replay Evidence

Replay evidence should include:

- target repository URL and ref
- official docs URLs and retrieval date
- setup commands
- test commands
- Boulder commands
- expected artifacts
- limitations
- public evidence paths
