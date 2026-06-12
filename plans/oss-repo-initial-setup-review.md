# OSS Repo Initial Setup Review Plan

## TL;DR
> **Summary**: Boulder has a usable OSS CLI skeleton, but against the NAIYA repo setup reference it is not yet contributor-safe. The highest-priority work is to harden `.github`, governance, AI contribution disclosure, security/contract gates, and decision-recording before inviting broader contributions.
> **Deliverables**:
> - NAIYA-to-Boulder setup gap matrix
> - root health docs plan
> - GitHub templates and CODEOWNERS plan
> - branch protection and status-check checklist
> - AI contribution policy plan
> - CI/security/docs/contract gate plan
> - labels/milestones/community operating plan
> - initial PR sequence with verification
> **Effort**: Medium
> **Parallel**: YES - 4 waves
> **Critical Path**: T1 gap matrix -> T2 `.github` intake surface -> T3 governance/AI policy -> T4 CI/security gates -> T8 final setup audit

## Context

### Original Request

Review Boulder’s current open-source repository initial setup using `/Users/burt/Downloads/naiya_repo_setup_visual.html` and produce an `omo:ulw-plan`.

### Interview Summary

No further user input is required. The reference HTML is prescriptive enough and Boulder’s current repo surface is discoverable:

- Present: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `ROADMAP.md`, `CHANGELOG.md`, `LICENSE`, `.github/workflows/ci.yml`.
- Missing: `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, dedicated security workflow, ADR structure, AI contribution policy, review policy, label/milestone catalog.
- Current product-readiness is blocked by public-product evidence gaps that overlap with repo setup gaps.

### Metis Review (gaps addressed)

- **Do not copy NAIYA architecture literally**: Boulder is not `naiya-os`; do not create irrelevant `packages/app-shell`, `voice`, or `memory` directories.
- **Separate GitHub UI actions from repo-file actions**: branch protection, secret scanning, Dependabot, CodeQL enablement may need GitHub settings. The plan records them as checklist tasks with verifiable `gh` or UI evidence, not code changes.
- **Do not overclaim readiness**: adding templates is not the same as a working contribution process; CI and product-readiness must prove the process.
- **Protect current dirty work**: several Boulder files are modified/untracked. Execution must avoid reverting existing work and must stage only intended files.
- **AI contribution policy must be practical**: require disclosure, rationale, tests, and human explanation; do not ban AI contributions.

## Work Objectives

### Core Objective

Bring Boulder’s public repository initial setup to a contributor-safe OSS baseline aligned with the NAIYA reference: “anyone can propose; only reviewed, tested, documented, explainable changes can merge.”

### Deliverables

- `docs/OSS_REPO_SETUP_REVIEW.md` gap matrix comparing NAIYA reference to Boulder.
- `.github/ISSUE_TEMPLATE/bug_report.yml`.
- `.github/ISSUE_TEMPLATE/feature_request.yml`.
- `.github/ISSUE_TEMPLATE/ai_contribution.yml`.
- `.github/ISSUE_TEMPLATE/documentation.yml`.
- `.github/PULL_REQUEST_TEMPLATE.md`.
- `.github/CODEOWNERS`.
- `CODE_OF_CONDUCT.md`.
- `GOVERNANCE.md`.
- `docs/contributing/development-setup.md`.
- `docs/contributing/ai-contribution-policy.md`.
- `docs/contributing/review-policy.md`.
- `docs/adr/0001-project-scope.md`.
- `docs/adr/0002-contract-first-development.md`.
- `.github/workflows/security.yml` or documented security-gate decision.
- `docs/labels-and-milestones.md`.
- Updated `docs/PRODUCT_READINESS.md` or follow-up linkage after product-readiness gap closure.

### Definition of Done

All checks must be executable:

```bash
bun test
bun run ci
bun bin/boulder.ts product-readiness --json
find .github -maxdepth 3 -type f | sort
find docs/contributing docs/adr -maxdepth 2 -type f | sort
```

The setup is complete when:

- `.github` contains issue templates, PR template, CODEOWNERS, CI workflow, and security workflow or documented deferral.
- Root contains README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, GOVERNANCE, ROADMAP, CHANGELOG, LICENSE.
- Docs contain development setup, AI contribution policy, review policy, ADRs, labels/milestones.
- PR template requires test evidence, contract/check evidence, docs impact, risk scope, and AI usage disclosure.
- Issue templates split bug, feature, AI contribution, documentation.
- CODEOWNERS has sane coverage for root docs, `src/`, `test/`, `.github/`, `docs/`, examples, and fixtures.
- Branch protection checklist names required status checks and review rules.

### Must Have

- Small PR policy.
- Issue-first rule for large/high-risk changes.
- AI disclosure and human explainability requirement.
- Contract-first framing for CLI/schema/release-readiness changes.
- No secrets in issues/PR templates.
- CODEOWNERS review requirement documented.
- Docs/CI/security gates tied to commands.

### Must NOT Have

- No fake GitHub branch protection claim without evidence.
- No NAIYA-specific package tree copied into Boulder.
- No hosted-service claim.
- No npm publish claim.
- No provider credential handling.
- No policy that blocks all AI usage.
- No template that asks users to paste secrets, tokens, private logs, or credentials.

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.

- Test decision: TDD for any CLI/product-readiness behavior changes; docs-only changes require static docs checks and tmux QA, not new unit tests unless code behavior changes.
- QA policy: Every task includes agent-executed tmux scenarios.
- Evidence: `.omo/ulw-loop/evidence/oss-repo-initial-setup/`.
- Manual QA channel: tmux for CLI/static file verification.
- Optional GitHub verification: `gh repo view`, `gh run list`, and branch-protection checks when credentials allow.

## Execution Strategy

### Parallel Execution Waves

Wave 1: Gap matrix and intake surface.

Wave 2: Governance, AI policy, review policy, ADRs.

Wave 3: CI/security gates, labels/milestones, branch protection checklist.

Wave 4: Product-readiness integration, final setup audit, QA evidence.

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
| --- | --- | --- | --- |
| T1 NAIYA-to-Boulder gap matrix | none | T8 | T2 |
| T2 Issue and PR templates | none | T8 | T1, T3 |
| T3 CODEOWNERS | none | T8 | T2, T4 |
| T4 Governance and code of conduct | none | T8 | T3, T5 |
| T5 AI contribution and review policy | T4 optional | T8 | T6 |
| T6 ADR and development setup docs | none | T8 | T5 |
| T7 CI/security/branch protection/labels | T2, T3 | T8 | none |
| T8 Final setup audit and product-readiness linkage | T1-T7 | release | none |

## TODOs

- [ ] 1. NAIYA-to-Boulder Gap Matrix

  **What to do**: Create `docs/OSS_REPO_SETUP_REVIEW.md` with a table mapping each NAIYA reference area to Boulder’s current state, gap, priority, and planned file/action.

  **Must NOT do**: Do not mark GitHub UI settings as complete unless verified by command or screenshot/evidence.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T8 | Blocked By: none

  **References**:
  - `/Users/burt/Downloads/naiya_repo_setup_visual.html` - source reference.
  - `.github/workflows/ci.yml` - current CI.
  - `docs/PRODUCT_READINESS.md` - current public-product gate.
  - `plans/product-readiness-gap-closure.md` - existing readiness gap plan.

  **Acceptance Criteria**:
  - [ ] Matrix covers principles, tree, docs, GitHub settings, contribution pipeline, AI policy, CI/security, labels/milestones, community, initial PR checklist.
  - [ ] Each row has `status`, `gap`, `priority`, `next action`.
  - [ ] Boulder-specific non-goals are recorded.

  **QA Scenarios**:
  ```text
  Scenario: gap matrix covers every NAIYA section
    Tool: tmux
    Steps: tmux new-session -d -s ulw-qa-oss-gap 'cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder && rg -n "Principles|Repository Tree|Documents|GitHub Settings|Contribution Pipeline|AI Contribution Policy|CI|Security|Labels|Milestones|Community|Initial PR|Checklist" docs/OSS_REPO_SETUP_REVIEW.md'
    Expected: every listed section appears at least once
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t1-gap-matrix.txt

  Scenario: no NAIYA package tree copied
    Tool: tmux
    Steps: run `rg -n "app-shell|voice|memory-model|naiya-os" docs/OSS_REPO_SETUP_REVIEW.md`
    Expected: matches appear only in reference/non-goal context, not as Boulder directories to create
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t1-noncopy.txt
  ```

  **Commit**: YES | Message: `docs(oss): add repository setup gap review` | Files: `docs/OSS_REPO_SETUP_REVIEW.md`

- [ ] 2. GitHub Issue and PR Intake Surface

  **What to do**: Add issue templates and PR template:
  - `.github/ISSUE_TEMPLATE/bug_report.yml`
  - `.github/ISSUE_TEMPLATE/feature_request.yml`
  - `.github/ISSUE_TEMPLATE/ai_contribution.yml`
  - `.github/ISSUE_TEMPLATE/documentation.yml`
  - `.github/PULL_REQUEST_TEMPLATE.md`

  **Must NOT do**: Do not ask users to paste secrets or private logs.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: T7, T8 | Blocked By: none

  **References**:
  - NAIYA HTML section `Repository Tree` and `Contribution Pipeline`.
  - `CONTRIBUTING.md` - current contribution guide.
  - `docs/TRUST_SUPPORT_SECURITY.md` - secret and security posture.

  **Acceptance Criteria**:
  - [ ] Bug template asks for command, reproduction, expected/actual, environment, and evidence.
  - [ ] Feature template asks for problem, scope, non-goals, verification plan.
  - [ ] AI contribution template asks for AI tool disclosure, human explanation, tests, risk.
  - [ ] Documentation template asks for source of truth and affected docs.
  - [ ] PR template requires summary, linked issue, tests, docs impact, risk, AI usage, contract/check results.

  **QA Scenarios**:
  ```text
  Scenario: templates exist and contain required fields
    Tool: tmux
    Steps: run `find .github -maxdepth 3 -type f | sort && rg -n "AI|tests|risk|secrets|contract|docs" .github`
    Expected: all five template files exist and required keywords are present
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t2-templates.txt

  Scenario: templates do not request secrets
    Tool: tmux
    Steps: run `rg -n "paste.*token|paste.*secret|private key|credential" .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md`
    Expected: no unsafe request wording; allowed wording only says not to include secrets
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t2-secret-safety.txt
  ```

  **Commit**: YES | Message: `docs(github): add contributor intake templates` | Files: `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] 3. CODEOWNERS

  **What to do**: Add `.github/CODEOWNERS` with broad ownership for the current Boulder tree.

  **Must NOT do**: Do not invent unavailable GitHub usernames beyond the current owner. Use `@min9lin9` if that is the repo owner, or a placeholder only if clearly marked for maintainer replacement.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T7, T8 | Blocked By: none

  **References**:
  - `gh repo view min9lin9/boulder` previously confirmed public owner/repo.
  - Current paths: `src/`, `test/`, `docs/`, `.github/`, `examples/`, `fixtures/`.

  **Acceptance Criteria**:
  - [ ] `.github/CODEOWNERS` exists.
  - [ ] Covers `*`, `.github/`, `src/`, `test/`, `docs/`, `examples/`, `fixtures/`, `package.json`.
  - [ ] README or governance docs mention CODEOWNERS review as expected for protected paths.

  **QA Scenarios**:
  ```text
  Scenario: CODEOWNERS covers core paths
    Tool: tmux
    Steps: run `rg -n "^\\*|src/|test/|docs/|examples/|fixtures/|package.json" .github/CODEOWNERS`
    Expected: every core path is covered
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t3-codeowners.txt

  Scenario: CODEOWNERS file is discoverable
    Tool: tmux
    Steps: run `test -f .github/CODEOWNERS && sed -n '1,120p' .github/CODEOWNERS`
    Expected: exits 0 and prints ownership entries
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t3-codeowners-discoverable.txt
  ```

  **Commit**: YES | Message: `docs(github): add codeowners` | Files: `.github/CODEOWNERS`

- [ ] 4. Governance and Code of Conduct

  **What to do**: Add `GOVERNANCE.md` and `CODE_OF_CONDUCT.md`. Governance must define project lead, maintainer, reviewer, contributor, decision records, security escalation, and merge authority.

  **Must NOT do**: Do not create governance that implies a team exists if only one maintainer is active. Say “current maintainer” and “future maintainers” honestly.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T8 | Blocked By: none

  **References**:
  - NAIYA HTML `Documents` section.
  - `CONTRIBUTING.md`.
  - `SECURITY.md`.

  **Acceptance Criteria**:
  - [ ] `GOVERNANCE.md` exists and defines roles and decision process.
  - [ ] `CODE_OF_CONDUCT.md` exists and provides enforcement/contact path.
  - [ ] README links both or CONTRIBUTING links both.

  **QA Scenarios**:
  ```text
  Scenario: governance files exist
    Tool: tmux
    Steps: run `test -f GOVERNANCE.md && test -f CODE_OF_CONDUCT.md && rg -n "Maintainer|Reviewer|Contributor|Decision|Security" GOVERNANCE.md`
    Expected: exits 0 and required governance terms appear
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t4-governance.txt

  Scenario: governance avoids fake team claims
    Tool: tmux
    Steps: run `rg -n "steering committee|board|multiple maintainers" GOVERNANCE.md`
    Expected: no unsupported team-structure claims
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t4-no-fake-team.txt
  ```

  **Commit**: YES | Message: `docs(oss): add governance and conduct policy` | Files: `GOVERNANCE.md`, `CODE_OF_CONDUCT.md`, optional README/CONTRIBUTING links

- [ ] 5. AI Contribution and Review Policy

  **What to do**: Add `docs/contributing/ai-contribution-policy.md` and `docs/contributing/review-policy.md`. AI use is allowed, but contributors must disclose tool use, explain the change, provide tests, list risk, and reduce scope.

  **Must NOT do**: Do not ban AI. Do not accept “AI wrote it” as sufficient explanation.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T8 | Blocked By: none

  **References**:
  - NAIYA HTML `AI Contribution Policy`.
  - `docs/GJC_LAZYCODEX_HANDOFF.md`.
  - `docs/TRUST_SUPPORT_SECURITY.md`.

  **Acceptance Criteria**:
  - [ ] AI policy contains allow/caution/reject categories.
  - [ ] Review policy states small PR, issue-first for large changes, docs impact, tests, and contract check.
  - [ ] PR template links to these policies.

  **QA Scenarios**:
  ```text
  Scenario: AI policy has actionable categories
    Tool: tmux
    Steps: run `rg -n "Allowed|Caution|Rejected|AI tool|human explanation|tests|risk" docs/contributing/ai-contribution-policy.md`
    Expected: all terms appear
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t5-ai-policy.txt

  Scenario: review policy requires verification
    Tool: tmux
    Steps: run `rg -n "small PR|Issue first|test|contract|docs|risk" docs/contributing/review-policy.md .github/PULL_REQUEST_TEMPLATE.md`
    Expected: policy and PR template both require verification
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t5-review-policy.txt
  ```

  **Commit**: YES | Message: `docs(contributing): add ai contribution review policy` | Files: `docs/contributing/ai-contribution-policy.md`, `docs/contributing/review-policy.md`, `.github/PULL_REQUEST_TEMPLATE.md`

- [ ] 6. Development Setup and ADR Baseline

  **What to do**: Add `docs/contributing/development-setup.md`, `docs/adr/0001-project-scope.md`, and `docs/adr/0002-contract-first-development.md`.

  **Must NOT do**: Do not invent a package split or runtime not present in the repo.

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: T8 | Blocked By: none

  **References**:
  - `package.json` scripts: `test`, `ci`, `pack:dry-run`, `smoke`.
  - `README.md` quickstart.
  - NAIYA HTML `Contract-first Development`.

  **Acceptance Criteria**:
  - [ ] Development setup names Bun version expectation and commands.
  - [ ] ADR 0001 defines Boulder scope and non-goals.
  - [ ] ADR 0002 defines contract-first rules for CLI, pipeline, export, release/product readiness.
  - [ ] CONTRIBUTING links development setup and ADRs.

  **QA Scenarios**:
  ```text
  Scenario: setup docs match package scripts
    Tool: tmux
    Steps: run `rg -n "bun test|bun run ci|bun run pack:dry-run|bun bin/boulder.ts" docs/contributing/development-setup.md`
    Expected: all core commands are documented
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t6-dev-setup.txt

  Scenario: ADRs capture scope and contract-first
    Tool: tmux
    Steps: run `rg -n "Status: Accepted|Scope|Non-goals|Contract-first|product-readiness|pipeline" docs/adr`
    Expected: ADR files contain required decisions
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t6-adrs.txt
  ```

  **Commit**: YES | Message: `docs(adr): add scope and contract decisions` | Files: `docs/contributing/development-setup.md`, `docs/adr/*.md`, optional `CONTRIBUTING.md`

- [ ] 7. CI, Security, Branch Protection, Labels, and Milestones

  **What to do**: Add `.github/workflows/security.yml` if feasible, plus `docs/labels-and-milestones.md` and `docs/branch-protection.md`. Document required branch rules: no direct push, one approving review, CODEOWNERS review, CI required, force push disabled, deletion disabled.

  **Must NOT do**: Do not claim GitHub settings are enabled unless verified. Mark settings as “required configuration” until checked.

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: T8 | Blocked By: T2, T3

  **References**:
  - `.github/workflows/ci.yml` - current baseline.
  - NAIYA HTML `GitHub Settings`, `CI & Security`, `Labels & Milestones`.
  - `docs/TRUST_SUPPORT_SECURITY.md`.

  **Acceptance Criteria**:
  - [ ] Security workflow exists or an explicit deferred decision explains why.
  - [ ] Branch protection doc lists required settings and verification command/manual evidence.
  - [ ] Label catalog includes priority, type, area, good first issue, help wanted, needs decision.
  - [ ] Milestones M0-M3 are defined with Boulder-specific meaning.

  **QA Scenarios**:
  ```text
  Scenario: setup operations docs exist
    Tool: tmux
    Steps: run `test -f docs/branch-protection.md && test -f docs/labels-and-milestones.md && rg -n "direct push|CODEOWNERS|status check|force push|good first issue|M0|M1|M2|M3" docs/branch-protection.md docs/labels-and-milestones.md`
    Expected: exits 0 and required operations terms appear
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t7-ops-docs.txt

  Scenario: security gate is explicit
    Tool: tmux
    Steps: run `test -f .github/workflows/security.yml || rg -n "security workflow.*deferred|CodeQL|Dependabot|secret scanning" docs/branch-protection.md docs/TRUST_SUPPORT_SECURITY.md`
    Expected: either workflow exists or deferral is explicitly documented
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t7-security-gate.txt
  ```

  **Commit**: YES | Message: `docs(github): document security and branch gates` | Files: `.github/workflows/security.yml`, `docs/branch-protection.md`, `docs/labels-and-milestones.md`

- [ ] 8. Final OSS Setup Audit and Product-Readiness Linkage

  **What to do**: Update `docs/OSS_REPO_SETUP_REVIEW.md` final status after tasks complete, then link the setup review from README/CONTRIBUTING and from the product-readiness docs if appropriate. Do not mark public product readiness complete until `plans/product-readiness-gap-closure.md` blockers are also resolved.

  **Must NOT do**: Do not change `product-readiness` from blocked to ready by weakening checks.

  **Parallelization**: Can Parallel: NO | Wave 4 | Blocks: release | Blocked By: T1-T7

  **References**:
  - `docs/PRODUCT_READINESS.md`.
  - `plans/product-readiness-gap-closure.md`.
  - `README.md`, `CONTRIBUTING.md`.

  **Acceptance Criteria**:
  - [ ] Setup review marks each repo-initialization area as pass, partial, or deferred.
  - [ ] README or CONTRIBUTING links setup/review/policy docs.
  - [ ] Product-readiness blocked checks are not hidden.
  - [ ] `bun test` and `bun run ci` pass.

  **QA Scenarios**:
  ```text
  Scenario: setup audit is discoverable
    Tool: tmux
    Steps: run `rg -n "OSS_REPO_SETUP_REVIEW|ai-contribution-policy|review-policy|GOVERNANCE|CODE_OF_CONDUCT|branch-protection" README.md CONTRIBUTING.md docs/OSS_REPO_SETUP_REVIEW.md`
    Expected: links/references exist
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t8-discoverability.txt

  Scenario: product readiness remains honest
    Tool: tmux
    Steps: run `bun bin/boulder.ts product-readiness --json`
    Expected: status reflects actual unresolved product-readiness gaps; no false ready if install/release evidence is missing
    Evidence: .omo/ulw-loop/evidence/oss-repo-initial-setup/t8-product-readiness-honesty.txt
  ```

  **Commit**: YES | Message: `docs(oss): complete repository setup audit` | Files: `docs/OSS_REPO_SETUP_REVIEW.md`, `README.md`, `CONTRIBUTING.md`, optional `docs/PRODUCT_READINESS.md`

## Final Verification Wave
> ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. Plan Compliance Audit
  - Confirm all NAIYA sections are represented or explicitly deferred.
  - Confirm no NAIYA-specific app package tree was added.

- [ ] F2. Code Quality Review
  - Run `bun test`.
  - Run `bun run ci`.
  - Run static file checks:
    ```bash
    find .github -maxdepth 3 -type f | sort
    find docs/contributing docs/adr -maxdepth 2 -type f | sort
    ```

- [ ] F3. Real Manual QA
  - Use tmux to capture:
    - setup file inventory
    - policy keyword checks
    - product-readiness honesty check
  - Store artifacts under `.omo/ulw-loop/evidence/oss-repo-initial-setup/`.
  - Kill all tmux sessions and record cleanup receipts.

- [ ] F4. Scope Fidelity Check
  - `git diff --stat`
  - Confirm no implementation/runtime/provider changes were added.
  - Confirm existing dirty work was not reverted.

## Commit Strategy

Suggested commits:

1. `docs(oss): add repository setup gap review`
2. `docs(github): add contributor intake templates`
3. `docs(github): add codeowners`
4. `docs(oss): add governance and conduct policy`
5. `docs(contributing): add ai contribution review policy`
6. `docs(adr): add scope and contract decisions`
7. `docs(github): document security and branch gates`
8. `docs(oss): complete repository setup audit`

Do not auto-commit unless the operator explicitly approves.

## Success Criteria

- Boulder has the repo health files expected by the NAIYA setup reference, adapted to Boulder’s CLI scope.
- `.github` is ready for external issues and PRs.
- AI contribution is allowed but constrained by disclosure, explanation, tests, and review.
- Governance and CODEOWNERS clarify who reviews what.
- Branch protection and labels/milestones have executable setup documentation.
- CI remains green.
- Product readiness remains honest and is not weakened to hide unresolved release/publish gaps.
