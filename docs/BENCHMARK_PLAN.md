# Benchmark Plan

Boulder benchmark work is deliberately fixture-first.

It does not claim:

- runtime speed leadership
- model quality comparison
- benchmark leaderboard placement

It does measure whether benchmark fixtures specify repeatable maintainer-harness expectations:

- expected generated files
- expected verification commands
- provider and secret-handling boundaries
- disallowed claims

Current fixtures:

- `fixtures/benchmarks/typescript-library.json`
- `fixtures/benchmarks/python-package.json`
- `fixtures/benchmarks/mcp-server.json`

Run:

```bash
boulder benchmark
```

Automation output:

```bash
boulder benchmark --json
```

M1 does not claim benchmark leadership.

Future evaluation should measure:

- harness generation completeness
- verification command accuracy
- maintainer workflow coverage
- export usefulness for Codex
- failure-mode clarity

Claims should be backed by repeatable fixtures and saved reports.
