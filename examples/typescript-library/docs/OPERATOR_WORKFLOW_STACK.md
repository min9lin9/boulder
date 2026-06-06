# Operator Workflow Stack

Boulder defaults to the har-maker operator stack. These are not runtime dependencies; they are the workflow contract Codex should preserve while working on the repository.

## Components

### superpowers

Role: workflow-spine
Required: yes

Drives brainstorming, planning, implementation, debugging, review, and verification discipline.

### gstack

Role: review-gate
Required: yes

Adds CSO, QA, executive, and office-hours review gates before risky implementation or release decisions.

### compound

Role: learning-layer
Required: yes

Captures reusable decisions, repeated failure modes, and durable workflow improvements after each cycle.

## Operating Loop

1. Superpowers drives brainstorming, planning, implementation, debugging, review, and verification.
2. GStack inserts CSO, QA, executive, or office-hours review gates when risk or ambiguity rises.
3. Compound records reusable decisions, repeated failure modes, and workflow improvements after the cycle.
4. Boulder keeps the public OSS surface bounded to repo context, approval gates, local verification, and evidence.

## Boundary

This stack should not imply autonomous durable writes. Human approval and local verification remain required before high-risk changes, releases, or external-provider usage.
