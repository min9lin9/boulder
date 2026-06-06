# Static Gates

Status: PASS
Date: 2026-06-06

## LSP

Invocation:

```text
mcp__lsp.diagnostics(filePath="/Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder-ulw-slop/src/cli.ts", severity="all")
mcp__lsp.diagnostics(filePath="/Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder-ulw-slop/src/scorecard.ts", severity="all")
mcp__lsp.diagnostics(filePath="/Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder-ulw-slop/src/globals.d.ts", severity="all")
mcp__lsp.diagnostics(filePath="/Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder-ulw-slop/test/cli-e2e.test.ts", severity="all")
```

Changed files checked:

- `src/cli.ts`: no diagnostics
- `src/scorecard.ts`: no diagnostics
- `src/globals.d.ts`: no diagnostics
- `test/cli-e2e.test.ts`: no diagnostics

## AST Sanity

The MCP ast-grep wrapper could not run because the global `sg` binary was missing. The AST sanity check was rerun with the repo-local Bun invocation:

```bash
bunx @ast-grep/cli --pattern 'printLines($$$)' --lang ts src/cli.ts
bunx @ast-grep/cli --pattern '$X as $T' --lang ts src/cli.ts src/scorecard.ts test/cli-e2e.test.ts
```

Evidence:

- No `printLines(...)` AST matches in `src/cli.ts`.
- No TypeScript `as` cast AST matches in the changed files.

## CI

```bash
bun run ci
```

Evidence:

- PASS
- 24 tests
- 94 assertions
- build passed
- pack dry-run passed

## Pure LOC

Baseline:

- `src/cli.ts`: 145
- `src/scorecard.ts`: 216
- `src/globals.d.ts`: 43

Current:

- `src/cli.ts`: 142
- `src/scorecard.ts`: 213
- `src/globals.d.ts`: 44

Net source reduction: 5 pure LOC.
