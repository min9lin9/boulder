# Repository Guidelines

## Project Overview

Boulder (`boulder-oss-cli@0.1.16`) is a Bun/TypeScript ESM CLI that turns OSS repositories into evidence-backed Codex workflows while keeping maintainers in control. It creates repo briefs, workflow profiles, capability inventories, sanitized handoff packets, readiness reports, replay fixtures, and release evidence. It is a review-first local CLI — not a hosted service, agent runtime, or provider integration.

Public workflow verbs are `intake -> plan -> execute -> verify -> record`. The default profile `programming-default` keeps GJC as planning preference and LazyCodex as execution preference. `boulder-native-preview` is an opt-in local planning profile whose `plan analyze|show|validate` commands are read-only; it never replaces the default. `plan benchmark` validates externally produced, signed study evidence; the repository itself never contacts providers or executes benchmark runs.

## Architecture & Data Flow

- `bin/boulder.ts` is the development entry point (Bun shebang, calls `main(Bun.argv.slice(2))`); packaged commands `boulder` and `boulder-oss-cli` resolve through `bin/boulder.js`, a Node shim that spawns `bun bin/boulder.ts`.
- `src/cli.ts` is a router only — it parses global options and dispatches; it owns no domain logic. Subcommand routers live in `*-command.ts` modules (`plan-command.ts`, `profile-command.ts`, `capability-command.ts`, `handoff-command.ts`, `routine-command.ts`).
- Typical flow: CLI args -> `parseOptions`/dispatch -> domain `evaluate*`/`build*` module -> report object -> `prettyJson()` (with `--json`) or a `*ToMarkdown()` formatter -> stdout, and when required a guarded repo-local write via `src/fs.ts`.
- Fail statuses (`blocked`/`fail`) set `process.exitCode = 1` and print `ERROR <id>: message` to stderr; never `process.exit()`. JSON-mode errors use `boulder.error.v1` envelopes.
- Profile routing is preferred: `resolveWorkflowProfile()` precedence is explicit CLI profile -> `.boulder/current-profile` -> legacy `boulder.yaml.executors` -> built-in `programming-default`, attaching `profile.drift.*` warnings.
- `src/manifest.ts` owns `boulder.yaml` defaults, hand-rolled serialization, and defaults-merged loading (parser helpers in `src/manifest-yaml.ts`; no YAML dependency). Strict checking lives in the separate `validate` command.
- `src/fs.ts` is the write-safety boundary: all generated writes stay under the target repo and reject traversal, symlink, and hardlink targets; `UnsafeGeneratedWritePathError` maps to stable `ERROR fs.path_invalid`. Writes return `created`/`skipped` unless `--force`.
- State is project-local under `.boulder/`: `plans/<runId>/{analysis,state,packet}.json` (atomic writes + cooperative locks in `src/plan-store.ts`), `profiles/*.json`, `current-profile`, capability imports, preview event evidence. External sends, installs, updates, and applies are always approval-gated.

## Key Directories

| Path | Purpose |
| --- | --- |
| `bin/` | Development (`boulder.ts`) and packaged (`boulder.js`) CLI entry points. |
| `src/` | Command routing, domain modules, profiles, capabilities, handoffs, planner, readiness gates. Read `src/AGENTS.md` before editing. |
| `test/` | Bun unit, contract/fixture, and CLI/e2e tests plus `helpers/cli.ts`. Read `test/AGENTS.md` before editing. |
| `fixtures/` | Stable contract inputs: `profiles/`, `capabilities/`, `benchmarks/`, `planner-benchmarks/`, `planning-contracts/`, `plan-analysis/`, `plan-receipts/`, `planning-packets/`, `replay/`, `provider-policies/`, `handoffs/`, `service-readiness/`. |
| `docs/` | User-facing behavior, architecture, readiness gates, `CASE_STUDIES/` + evidence. Documentation is product surface; read `docs/AGENTS.md` (and `docs/CASE_STUDIES/AGENTS.md` for case studies). |
| `skills/` | Packaged Codex skills (`boulder`, `boulder-bootstrap-designer`, `boulder-native-planner`) and local wrapper scripts. Read `skills/AGENTS.md`. |
| `examples/` | Embedded target repos (`mcp-server`, `python-package`, `typescript-library`) maintained as fixture contracts. Read `examples/AGENTS.md`. |
| `.boulder/` | Repo-local runtime state; not source code. |
| `evidence/`, `plans/` | Checked-in maintainer evidence and planning docs (not runtime state; `evidence/field-readiness/` feeds the service-readiness gate). |
| `.codegraph`, `.code-review-graph/`, `.omo/`, `.gjc/` | Host-specific tooling/workflow state; not source, package, or release content. |

## Development Commands

```bash
bun install                         # install development dependencies (typescript only)
bun run boulder -- --help          # run the local CLI (alias for bun bin/boulder.ts)
bun test                            # full Bun test suite
bun test test/cli-e2e.test.ts       # focused test file(s), space-separated
bunx tsc --noEmit                  # strict typecheck (no dedicated script)
bun run build                       # Bun-targeted build to /tmp/boulder-build (never repo-local dist/)
bun run pack:dry-run                # inspect npm package contents
bun run ci                          # canonical gate: help smoke + tests + build + package dry-run
```

For a non-trivial TypeScript change, run the focused tests for the touched surface and `bunx tsc --noEmit`. Run `bun run ci` for release, packaging, or broad public-surface changes. There is no lint or format script; preserve the surrounding two-space TypeScript/Markdown style and avoid unrelated formatting.

For local Codex skill use, prefer the checked-out wrapper over registry execution:

```bash
./skills/boulder/scripts/boulder-local.sh inspect --cwd /path/to/repo --json
```

Command-specific options follow the command; do not place `--cwd` before it.

## Code Conventions & Common Patterns

- TypeScript ESM, plain exported functions, typed readonly records, small focused modules. Classes are used only for Error subclasses with stable ids (`UnsafeGeneratedWritePathError`, `PlanStorePathError`, `PlanStoreLockError`, `ProfileNotFoundError`). No DI container.
- Pass dependencies (target repo path, parsed options) explicitly. Async functions perform filesystem/Git/profile work; parsers, validators, builders, and formatters stay synchronous when possible. All I/O is `async/await` over `node:fs/promises`; no sync fs.
- Error handling has three tiers: typed error subclasses with dotted stable ids (`fs.path_invalid`, `plan.path.invalid`) for contract violations; validators returning issue lists (`{id, path, message}` / `{valid, issues}`) for user-supplied artifacts; `null`-on-missing reads so absence is data, not an exception.
- Use `camelCase` for functions/variables, `PascalCase` for types and error classes, kebab-case file names (`capability-doctor.ts`).
- Keep JSON contracts additive unless a deliberate breaking change is pinned by tests. JSON output exposes targeted domain fields; human output uses domain-specific Markdown helpers.
- Import extensions are split by cohort and stable: legacy modules use extensionless relative imports; the newer `plan-*`/`planner-*` stack uses explicit `.js` specifiers. Match the surrounding file.
- Keep recommendation, `--dry-run`, persisted `--write`, `doctor` verification, and approval-gated execution as distinct states.
- `doctor` reports availability only (`available` vs `configured-unverified`); it never installs, clones, updates, or launches. Capability import records canonical source candidates only. GitHub sources canonicalize to `https://github.com/<owner>/<repo>` with ids like `github__owner__repo`.
- Keep built-in workflow presets and bootstrap-interview recommendations aligned; do not create a second profile taxonomy.
- Do not add dependencies. The project has zero runtime dependencies; Bun built-ins are used directly with hand-written ambient types in `src/globals.d.ts` (no `@types/*` packages).

## Important Files

- `src/cli.ts`: public `main(args)`, dispatch, output selection, exit-code policy. `const VERSION` duplicates `package.json` version — bump both together.
- `src/cli-options.ts` / `src/cli-format.ts`: shared option parsing and output formatting.
- `src/workflow-profiles.ts`, `src/workflow-profile-builtins.ts`, `src/profile-command.ts`, `src/profile-store.ts`: profile resolution, built-ins, state-changing commands, persistence.
- `src/plan-command.ts`, `src/plan-store.ts`, `src/plan-state.ts`, `src/plan-receipts.ts`: planner subcommands, hardened persistence (containment, locks, atomic writes), lifecycle, HMAC-signed challenges/receipts.
- `src/planner-router.ts`, `src/planner-output-normalizer.ts`, `src/planning-packet.ts`, `src/planning-canonical.ts`: pure planner routing (never invokes adapters), strict cross-planner normalization, packet contracts, canonical digests.
- `src/planner-benchmark.ts`, `src/planner-benchmark-command.ts`: signed study-evidence validation behind `plan benchmark`. Do not confuse with legacy `src/benchmark.ts` behind the top-level `benchmark` command.
- `src/capability-source*.ts`, `src/capability-command.ts`, `src/capability-doctor.ts`: source normalization, candidate imports, availability reporting.
- `src/handoff-*`: packet construction, validation, review, path safety, approval-gated send.
- `src/product-readiness.ts`, `src/service-readiness.ts`, `src/release-check.ts`, `src/replay-*`: evidence-backed gates.
- `src/manifest.ts`, `src/export.ts`, `src/fs.ts`: manifest I/O, generated exports, safe filesystem boundary.
- `package.json`: Bun scripts, binary mapping, engine floor, npm package allowlist (ships `bin`, `src`, `docs`, `fixtures`, three `skills/*` dirs; excludes all `AGENTS.md`, `test/`, `examples/`).
- `tsconfig.json`: strict no-emit config for `bin/`, `src/`, `test/`.
- `boulder.yaml`: this repo's own manifest (workflow stack, `protectedPaths`, provider policy `externalAllowed: false, approvalRequired: true`).
- `README.md`: public installation, command, safety, routing behavior.
- `docs/RELEASE_WORKFLOW.md`, `docs/PRODUCT_READINESS.md`: release ordering and readiness evidence.

## Runtime/Tooling Preferences

- Required runtime and package manager: Bun `>=1.3.14`. Use `bun`, `bun run`, and `bunx`; do not introduce npm/yarn/pnpm workflows. `bun.lock` is the only lockfile.
- ESM with strict TypeScript (`target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `noEmit: true`). TypeScript is the only devDependency and is type-check only; Bun does runtime transpilation.
- Build output intentionally goes to `/tmp/boulder-build`, never a repository-local `dist/`.
- Commands must remain deterministic and local-first. No hidden network validation, external model calls, automatic installation, or automatic update/apply behavior.
- Provider policy: default provider Codex; external providers approval-gated; protected paths (`.env*`, `secrets/**`, `vendor/**`, `node_modules/**`, `dist/**`) never go to external providers.

## Testing & QA

- Tests use Bun's `bun:test` API. Favor observable CLI behavior — exit code, stdout/stderr, JSON fields, filesystem effects — over private implementation assertions or full-output snapshots.
- Layers: (1) unit tests importing pure functions from `src/`; (2) contract/fixture tests validating vectors under `fixtures/` (every `invalid*.json` fixture needs a matching reject test); (3) CLI e2e tests driving the real CLI in temp repos; (4) meta tests in `test/source-cleanliness.test.ts` guarding source/docs/package invariants.
- Use `test/helpers/cli.ts` (`tempRepo()`, `runBoulder(args)` -> `{exitCode, stdout, stderr}`, `write()`, shared failure assertions). Always `removeTempRepo(root)` in a `finally` block in CLI e2e tests; never write outside temp repos except documented evidence output.
- Keep JSON assertions targeted to stable contract fields. Exact `ERROR <code>: <message>` assertions for stable safety errors; containment assertions for longer human-readable reports.
- Cover success and blocker branches: malformed manifests, missing/stale evidence, forged receipts, unsafe provider policies, traversal/symlink/hardlink targets.
- Checked-in examples and release evidence are contract fixtures. Release/version changes require aligned updates to `package.json`, `src/cli.ts` (`VERSION`), `CHANGELOG.md`, tests, and `docs/CASE_STUDIES/evidence/release-workflow/`.
- No coverage threshold is configured. Never weaken or delete failing tests, suppress warnings, or change evidence/docs merely to make a gate green.
- CI runs `bun run ci` on PRs and pushes (`.github/workflows/ci.yml`, Bun 1.3.14); CodeQL runs on PRs, pushes, and weekly (`.github/workflows/security.yml`).

Do not rewrite unrelated dirty files.
