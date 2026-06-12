# Capability Doctor

Boulder doctor lets an operator expose the installed Codex working set to the workflow planner without hardcoding one model, one executor, or one MCP server.

## Purpose

The doctor answers three questions before Boulder hands work to GJC, LazyCodex, Codex subagents, MCP tools, or installed skills:

- what capabilities are installed
- which workflow lane each capability should serve
- what official documentation or runtime compatibility issue must be handled before use

## Inventory

Default inventory path:

```text
fixtures/capabilities/codex-installed.json
```

The inventory is intentionally explicit. It is evidence, not an auto-discovery claim.

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

## Runtime Compatibility

Doctor checks runtime blockers that affect downstream executors. The first supported warning is:

```text
Gajae-Code requires Bun >=1.3.14; detected Bun <version>.
```

This keeps Boulder modular. Boulder can still validate packets and record evidence, but live GJC execution remains blocked until the runtime is upgraded.

## CLI

```bash
boulder doctor --json
```

Human output:

```bash
boulder doctor
```

`fail` means the capability inventory is missing or invalid. `warn` means Boulder can proceed with fixture-backed routing but the operator must resolve runtime or adapter issues before claiming live downstream execution.
