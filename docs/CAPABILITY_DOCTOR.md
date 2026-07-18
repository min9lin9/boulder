# Capability Doctor

Boulder doctor lets an operator expose the installed Codex working set to the workflow planner without hardcoding one model, one executor, or one MCP server.

## Purpose

The doctor answers three questions before Boulder hands work to GJC, LazyCodex, Codex subagents, MCP tools, or installed skills:

- what capabilities are installed
- which workflow lane each capability should serve
- what official documentation or runtime compatibility issue must be handled before use

## Explicit boulder-native Preview

`boulder-native-preview` is an explicit local planning profile, not a replacement for `programming-default`. Its `plan analyze`, `plan show`, and `plan validate` commands are read-only: they inspect local inputs or artifacts and do not install software, contact providers, invoke external agents, mutate product files, or execute a plan.

Preview planning approval and execution approval are separate explicit decisions. Preview event evidence is local-only in `.boulder/`. An external bridge from preview output to Handoff is follow-up RFC work and is not implemented; it is not current doctor behavior.
## Inventory

Default inventory path:

```text
fixtures/capabilities/codex-installed.json
```

The committed fixture is explicit evidence. When the fixture is absent, Boulder can also scan the local Codex home for installed skills, plugin-cache skills, MCP server config, plugin families, and the active Bun runtime.

Supported sections:

- `skills`: local Codex skills, including planning and execution methods
- `mcpServers`: MCP servers that can provide context, tools, or external evidence
- `plugins`: installed plugin families such as Superpowers, context-mode, and AST tools
- `runtimes`: runtime versions that can block downstream executors

## Lane Mapping

The user sees five verbs:

```text
intake -> plan -> execute -> verify -> record
```

Doctor routes capabilities into those verbs while the internal eight-lane lifecycle remains hidden inside workflow profiles.

Default examples:

- `omo:ulw-plan` -> `plan`
- `omo:ulw-loop` -> `execute`
- `omo:programming` -> `execute`
- `lennys-podcast-mcp` -> `intake`
- `code-review-graph` -> `verify`
- `superpowers` -> `compound`

## Official Docs First

For public OSS targets, Boulder should treat MCPs and external adapters as official-docs-first. The doctor reports `officialDocsFirst: true` when a capability is an MCP server or declares an official documentation URL.

The planner must then refresh official documentation before recommending setup, tests, replay, or adapter behavior.

## Source Candidates

When a preferred capability is not installed, Boulder can record a project-local source candidate from a canonical source URL:

```bash
boulder capability import --from https://github.com/Yeachan-Heo/gajae-code --dry-run
boulder capability import --from https://github.com/Yeachan-Heo/gajae-code --write
boulder capability import --from https://github.com/code-yeongyu/lazycodex --write
boulder capability import --from https://github.com/msitarzewski/agency-agents --dry-run
```

The persisted manifest lives under:

```text
.boulder/capabilities/imports/<registry-id>.json
```

Supported source grammar:

- `https://github.com/<owner>/<repo>`
- `github.com/<owner>/<repo>`
- `clawhub:<slug>`

GitHub sources are canonicalized to `https://github.com/<owner>/<repo>`. GJC is stored as `github__yeachan-heo__gajae-code`; LazyCodex is stored as `github__code-yeongyu__lazycodex`; agency-agents is stored as `github__msitarzewski__agency-agents` with kind `agent-catalog`.

Subagent catalogs are profile-scoped capability sources. Bootstrap may use an existing profile to choose a small subagent subset, or run an interview first, create the profile, and then choose the matching subset. Doctor reports the catalog candidate; it does not install all subagents.

## Lifecycle Status

Use `boulder capability status --cwd . --json` for read-only lifecycle reconciliation of imported source candidates against the local inventory. `doctor` stays focused on local availability and routing; `capability status` reports source candidate freshness, trust state, installed visibility, linked active profile, and lifecycle issues without installing, updating, cloning, or fetching anything.

Doctor reads these manifests and reports them as source candidates. It does not install, update, clone, or launch the capability. `doctor` remains read-only; future update checks belong to a separate `update` command.

## Runtime Compatibility

Doctor checks runtime blockers that affect downstream executors. The first supported warning is:

```text
Gajae-Code requires Bun >=1.3.14; detected Bun <version>.
```

This keeps Boulder modular. Boulder can still validate packets and record evidence, but live GJC execution remains blocked until the runtime is upgraded.

With Bun `>=1.3.14`, the warning is removed. Boulder still treats live GJC/LazyCodex commands as adapter candidates, not automatic launches.

For Gajae Code, `doctor` accepts the official Hermes bridge surfaces as the planning adapter:

- `gajae-code` or `gjc` skill/plugin/runtime ids
- `gjc_coordinator`, `gjc-coordinator`, or `gjc-coordinator-mcp` MCP ids
- `gjc-delegation` skill/plugin id
- `gjc_delegate_*` delegate tool ids

The non-mutating smoke commands are `gjc mcp-serve coordinator --check --json` and `gjc setup hermes --root . --smoke`. Delegate calls remain approval-gated.

When this warning appears, Boulder should keep routing in `detect-and-suggest` mode:

- planning preference: `gajae-code`
- execution preference: `lazycodex`
- fallback planner: `codex`
- fallback executor: `codex`

The warning blocks only live GJC execution claims. It does not block `inspect`, `pipeline`, `verify --dry-run`, `replay-check`, `product-readiness`, or evidence export.

## CLI

```bash
boulder doctor --json
```

Human output:

```bash
boulder doctor
```

`fail` means neither a valid fixture nor a readable local Codex inventory was available, or the committed fixture is malformed. `warn` means Boulder can proceed with routing but the operator must resolve runtime or adapter issues before claiming live downstream execution.
