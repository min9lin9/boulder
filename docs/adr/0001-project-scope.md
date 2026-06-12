# ADR 0001: Project Scope

Status: Accepted

## Context

Boulder helps OSS maintainers turn repository context into evidence-backed Codex workflows.

## Decision

Boulder is a local CLI and documentation workflow for maintainer-controlled repositories.

In scope:

- repository briefs
- operator contracts
- provider policy boundaries
- verification gates
- pipeline planning
- scorecards
- benchmark fixtures
- release-plan evidence
- product-readiness evidence
- exportable Codex workflow notes

Out of scope:

- hosted service claims
- autonomous provider launch
- credential handling
- benchmark leaderboard claims
- scanning repositories the operator does not own or administer
- claiming OpenAI acceptance or external adoption without public evidence

## Consequences

Boulder should stay small, local, deterministic, and evidence-first. Public claims must point to repository artifacts or public CI/release evidence.
