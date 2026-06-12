# OSS Repository Setup Review

Status: repo-file baseline complete; GitHub settings verification pending

Source reference: `/Users/burt/Downloads/naiya_repo_setup_visual.html`

This review maps the NAIYA open-source repository setup structure onto Boulder. Boulder is a Bun and TypeScript CLI project, so this review adapts the contribution-safety model without copying NAIYA-specific app package directories.

## Summary

Boulder now has the repository-file baseline for external contribution: README, CONTRIBUTING, SECURITY, ROADMAP, CHANGELOG, LICENSE, CI, issue templates, PR template, CODEOWNERS, governance, code of conduct, AI contribution policy, ADRs, branch-protection checklist, label/milestone catalog, and security gate documentation. GitHub UI settings such as branch protection, secret scanning, push protection, Dependabot, and CodeQL enablement still require external verification before they can be claimed as active.

## Gap Matrix

| NAIYA Area | Boulder State | Gap | Priority | Next Action |
| --- | --- | --- | --- | --- |
| Principles | Pass | Boulder now documents the rule that proposals are open but merge requires review, tests, docs, evidence, and explainability. | P0 | Keep governance and review policy linked from README and CONTRIBUTING. |
| Repository Tree | Pass | `.github`, `docs/contributing`, `docs/adr`, examples, fixtures, tests, and source code are separated by responsibility. | P0 | Do not add irrelevant NAIYA package directories. |
| Documents | Pass | README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, GOVERNANCE, ROADMAP, CHANGELOG, and LICENSE exist. | P0 | Keep root docs consistent with release state. |
| GitHub Settings | Partial | CODEOWNERS, PR template, CI, security workflow, and branch protection docs exist. Actual branch protection/settings still need GitHub verification. | P0 | Verify settings in GitHub before claiming active enforcement. |
| Contribution Pipeline | Pass | CONTRIBUTING links development setup, review policy, AI policy, governance, conduct, and branch protection. | P0 | Keep PR template aligned with policy. |
| AI Contribution Policy | Pass | AI use is allowed with disclosure, human explanation, tests, risk notes, and review. | P0 | Keep broad AI rewrites issue-first. |
| CI | Partial | `bun run ci` exists and runs smoke, tests, build, and pack dry-run. Docs/contract consistency is documented but not yet automated as a separate gate. | P1 | Add docs/contract consistency automation if product-readiness requires it later. |
| Security | Partial | SECURITY, trust/support posture, security workflow, and security settings checklist exist. GitHub secret scanning/push protection still needs settings verification. | P1 | Verify GitHub security settings externally. |
| Labels | Pass | Label catalog is documented. | P1 | Create labels in GitHub when ready. |
| Milestones | Pass | M0-M3 operating milestones are documented. | P1 | Create milestones in GitHub when ready. |
| Community | Partial | GitHub issues, PRs, ADRs, and release notes are defined as decision records. Discussion/Discord policy is intentionally minimal until needed. | P2 | Add Discussions guidance only when that channel is active. |
| Initial PR Plan | Pass | `plans/oss-repo-initial-setup-review.md` records the setup PR sequence. | P0 | Use final QA evidence before merge. |
| Checklist | Pass | This review is the standalone setup checklist. | P0 | Keep product-readiness blockers visible separately. |

## Boulder-Specific Non-Goals

- Do not create NAIYA-specific app, ADK, memory, voice, or shell package directories.
- Do not claim GitHub branch protection is enabled until verified in GitHub settings.
- Do not claim npm publication, hosted service availability, external adoption, or OpenAI acceptance.
- Do not require provider credentials for contribution, review, or local verification.

## Current Required Setup Files

Root:

- `README.md`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `GOVERNANCE.md`
- `ROADMAP.md`
- `CHANGELOG.md`
- `LICENSE`

GitHub:

- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/ai_contribution.yml`
- `.github/ISSUE_TEMPLATE/documentation.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/CODEOWNERS`
- `.github/workflows/ci.yml`
- `.github/workflows/security.yml`

Docs:

- `docs/contributing/development-setup.md`
- `docs/contributing/ai-contribution-policy.md`
- `docs/contributing/review-policy.md`
- `docs/adr/0001-project-scope.md`
- `docs/adr/0002-contract-first-development.md`
- `docs/branch-protection.md`
- `docs/labels-and-milestones.md`

## Product Readiness Linkage

This repository setup baseline does not override `boulder product-readiness`. Product readiness can remain blocked while repository setup is complete, especially for package publication, install smoke, public CI run evidence, handoff fixtures, and final audit wording.

## Remaining External Verification

- GitHub branch protection settings.
- GitHub secret scanning and push protection.
- Dependabot alerts and security updates.
- CodeQL workflow execution on the public repository.
- GitHub labels and milestones creation.
