# Boulder Service Loop

Status: pilot workflow

Boulder service is not hosted SaaS. It is a repeatable public OSS workflow delivered through CLI commands, repository files, evidence artifacts, and support operations.

Architecture reference: `docs/WORKFLOW_ARCHITECTURE.md`.

## Loop

1. `install`: use `bunx boulder-oss-cli --help` after publish, or local Bun commands before publish.
2. `init`: create a maintainer harness for the target repository.
3. `inspect`: capture repository context and protected paths.
4. `pipeline`: classify friction and select planning depth.
5. `handoff`: prepare GJC planning and LazyCodex implementation artifacts without launching those runtimes.
6. `verify`: run maintainer-declared verification commands.
7. `export`: produce Codex-ready workflow notes and evidence docs.
8. `readiness`: run product and service readiness gates.
9. `replay`: repeat the workflow against a public OSS target using official documentation first.
10. `support`: route onboarding, replay, handoff, and readiness failures through GitHub issues.

## Boundaries

- Boulder does not provide a hosted service.
- Boulder does not perform provider launch.
- Boulder does not require credentials for core commands.
- Humans approve releases, package publication, and public claims.

## Service Status Model

- `blocked`: required workflow evidence is missing.
- `pilot-ready`: onboarding, replay, handoff, support, and metrics evidence exists, but product-readiness still blocks public service claims.
- `ready`: service evidence and product-readiness both pass.

## Product Loop

Activation moment:

```text
first run -> repo-specific readiness/risk report -> next action list usable in an issue, PR, or release checklist
```

Repeat trigger:

```text
new PR, release, AI-assisted contribution, public OSS replay target, official docs change, or readiness gap change
```

Retention loop:

```text
repo event -> inspect/pipeline -> official docs replay -> handoff validation -> readiness delta -> shared evidence -> next repo event
```

The repeated value is the readiness delta and evidence trail, not a one-time generated document.

Non-retention signal:

```text
first run -> static scaffold only -> no changed recommendation -> no shared artifact
```

That path is useful setup, but it is not enough to call Boulder a repeatable service.

## Field Loop

Fixture-backed loop:

```text
gate fixture -> service-readiness pass -> pilot-ready claim
```

Field-backed loop:

```text
real maintainer event -> first-run transcript -> readiness delta -> shared artifact URL -> maintainer decision -> second repo event -> changed recommendation
```

Boulder should not claim field-backed service readiness until the second loop is captured at least once outside local fixture data.

## Distribution

Boulder should distribute through public artifacts maintainers already share:

- issue comments with `service-readiness` output
- pull request descriptions with handoff validation evidence
- release checklists with product-readiness deltas
- public replay reports with official documentation sources

Each artifact must be share-safe: no private paths, no local-only evidence, no secrets, and a clear maintainer decision or next action.
