# Branch Protection

Status: required configuration

This document records the expected GitHub settings. It does not claim the settings are enabled until verified in GitHub.

## Required `main` Rules

- Require pull request before merge.
- Require at least one approving review.
- Require CODEOWNERS review for protected paths.
- Require status check `CI / Smoke, build, and package`.
- Block force push.
- Block branch deletion.
- Dismiss stale approvals when protected files change if available.

## Verification

Use GitHub settings or `gh` permissions where available. Record evidence in the release or setup audit before claiming branch protection is active.

Suggested checks:

```bash
gh repo view min9lin9/boulder --json nameWithOwner,visibility,defaultBranchRef
gh run list --repo min9lin9/boulder --limit 5
```

## Security Settings

Enable or verify:

- secret scanning
- push protection
- Dependabot alerts
- Dependabot security updates
- CodeQL or equivalent code scanning

If any setting is unavailable, record the reason in the setup audit.
