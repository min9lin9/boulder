# Benchmark Fixture Report

This is not a runtime speed benchmark, model benchmark, or leaderboard claim.
It checks whether Boulder benchmark fixtures define repeatable harness expectations and explicit claim boundaries.

Fixtures: 3
Ready: 3/3

## Results

### mcp-server

Name: MCP server harness fixture
Repository shape: mcp-server
Score: 100/100
Rating: ready

- output-contract: pass (25/25) - core Boulder outputs are specified
- verification-contract: pass (25/25) - 2 verification expectation(s) specified
- boundary-contract: pass (25/25) - provider, local verification, and secret boundaries are specified
- claim-discipline: pass (25/25) - leaderboard, speed, and model-quality claims are disallowed

### python-package

Name: Python package harness fixture
Repository shape: python-package
Score: 100/100
Rating: ready

- output-contract: pass (25/25) - core Boulder outputs are specified
- verification-contract: pass (25/25) - 1 verification expectation(s) specified
- boundary-contract: pass (25/25) - provider, local verification, and secret boundaries are specified
- claim-discipline: pass (25/25) - leaderboard, speed, and model-quality claims are disallowed

### typescript-library

Name: TypeScript library harness fixture
Repository shape: typescript-library
Score: 100/100
Rating: ready

- output-contract: pass (25/25) - core Boulder outputs are specified
- verification-contract: pass (25/25) - 2 verification expectation(s) specified
- boundary-contract: pass (25/25) - provider, local verification, and secret boundaries are specified
- claim-discipline: pass (25/25) - leaderboard, speed, and model-quality claims are disallowed

## Disallowed Claims

- benchmark-leadership
- runtime-speed
- model-quality-comparison
