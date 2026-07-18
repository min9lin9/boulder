---
name: boulder-native-planner
description: Use when a user explicitly selects Boulder Native Planner to produce or assess a local planning packet. This skill plans and validates locally; it does not execute work.
metadata:
  short-description: Local native planning packets
---

# Boulder Native Planner

Use this skill only for an explicit `boulder-native` planner selection or the explicit `boulder-native-preview` profile. Do not replace `programming-default`; its planner remains unchanged.

## Local, Read-Only Analysis

Start with deterministic local analysis. Options follow the command:

```bash
boulder plan analyze --task "<task>" --friction direct --cwd <repo> --json
```

Honor an explicit higher friction request. Otherwise follow `selectedMode`: `direct` asks no questions, `focused` asks at most three owner-decision questions, and `deep` asks one weakest open dimension at a time. Read repository facts before asking and record their source references.

Validate a supplied planning packet locally before presenting it as approvable:

```bash
boulder plan validate --input <packet-path> --artifact packet --cwd <repo> --json
```

These commands inspect, analyze, or validate local inputs. They do not install software, contact providers, invoke external agents, mutate product files, or execute the plan.

## Packet Requirements

Keep one measurable objective. State allowed paths and non-goals, source every repository fact, and map every task to acceptance criteria, verification, and evidence. Record defaults as decisions. Include mitigation, rollback, and an explicit approval requirement for high or critical risks. Leave no executor judgment unresolved.

## Review and Approval Boundary

A structural and independent semantic critic must both join the exact planning-packet digest before the packet can be considered reviewed. Review and approval are workflow/API boundaries, not commands provided by this CLI. Address blocking findings, then validate the revised packet locally. Stop after three revisions and return any unresolved maintainer decision.

Inspect a persisted local run with:

```bash
boulder plan show --run-id <run-id> --cwd <repo> --json
```

Plan approval does not start execution, call a provider, launch an executor, or authorize product changes. Execution requires a separate explicit approval under the execution workflow.
