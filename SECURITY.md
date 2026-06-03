# Security

`boulder` is a maintainer workflow toolkit. It must not be used to scan, probe, or review repositories, systems, or codebases without authorization.

## Provider Boundaries

- Do not send secrets, private user data, or protected files to external providers.
- Treat external provider output as advisory until verified locally.
- Record provider usage when it affects a maintainer decision.

## Reporting Issues

Open a GitHub issue with a minimal reproduction and avoid including secrets or private repository data.
