# ADR 0004: K0R Sequencing Remediation

Status: Proposed superseding ADR — pending designated maintainer exact-byte approval and K0R exit; not presently effective, not an exit receipt, and not authority for K2–K4.

## Decision

ADR 0003 remains active for K0/K1 sequencing, compliance status, and authority unless and until the designated maintainer approves these exact ADR bytes and a separate K0R exit receipt issues after every remediation gate below passes. This document is a proposed superseding ADR only; before both conditions are met, it has no superseding effect. The historical K1-before-K0 sequence was non-compliant: K1 work occurred before the K0 decision/freeze gate required by ADR 0003. That history cannot be made compliant retroactively by this proposal, later evidence, review, or relabeling.

K0 and K1 claims remain provisional until a separately approved K0R exit receipt proves every remediation gate below. No prior K0/K1 artifact, test, review, or claim is K2 authority. ADR 0003's technical kernel constraints remain active and subject to K0R review; neither this proposal nor any K0R artifact implies that their prior sequencing has passed.

## Context

The gate order is K0, then K1, then K2, K3, and K4. The observed K1-before-K0 ordering broke that prerequisite. A bounded remediation must establish a reviewable K0 baseline from clean source without changing the product or claiming a completed remediation.

## Drivers

- Preserve an auditable distinction between historical work and accepted gate evidence.
- Reproduce K0 independently from clean source rather than trust a contaminated worktree.
- Bind evidence to exact bytes, reviewers, source identity, and command outcomes.
- Keep v1, root guidance, profiles, defaults, publication, and later gates out of scope.

## Alternatives

1. Accept K1 as implicit K0 evidence. Rejected: it reverses the required dependency and hides the non-compliance.
2. Declare later review retroactively cures the ordering. Rejected: review may evaluate evidence but cannot change historical sequence.
3. Continue to K2 while remediation is open. Rejected: K2 authority depends on a valid K0 then K1 chain.
4. Rebuild K0R in the existing planner worktree. Rejected: independent clean-source reproduction and isolation are required.

## Consequences

K0/K1 claims remain provisional and may be invalidated without asserting product regression. K0R creates evidence and governance artifacts only; it does not change source behavior, public contracts, package contents, or release state. K1 may be reconsidered only after K0R exit, under its own review and receipt; K2–K4 require their existing separate gates after that.

This unpackaged evidence relocation makes no package or public-contract change.

## Remediation gates

K0R exit requires all of the following, recorded in a separate immutable exit receipt that names this ADR and the isolation manifest:

1. An independent reproduction from a clean source identity and isolated worktree, using the executable isolation manifest. The reproduction must be independent of the historical K1 worktree and its mutable state.
2. Immutable, SHA-256 hash-bound evidence for the source identity, root `AGENTS.md`, manifest, command allowlist, command outputs, tracked and untracked pre/post inventories, diffs, vectors, and review inputs. Evidence is valid only when its recorded hashes and byte identities match the captured bytes.
3. Exact-byte review by independent Architect and Critic reviewers. Each review must identify the exact input-byte hashes, reviewer identity, outcome, findings, and review timestamp; a summary, a changed file, or a review of equivalent content is insufficient.
4. A complete K0 v1 inventory that identifies every applicable v1 public command, schema, default, profile, package/topology, guidance, fixture, and compatibility boundary, with evidence of no unauthorized change.
5. A separate K0R exit receipt, approved only after gates 1–4 pass. The receipt must contain the gate results, evidence hashes, reviewer approvals, source/worktree identity, and invalidation check. This ADR and the manifest are not that receipt.

Any missing, pending, stale, mismatched, unverifiable, or non-zero-tolerance result blocks exit. Evidence capture and review must fail closed; convenience, prior passage, and reviewer intent do not substitute for required bytes.

## Invalidation

K0R evidence and approvals are invalid immediately on any source, worktree, root `AGENTS.md`, manifest, allowlisted-command, environment-root, tracked/untracked inventory, output, diff, vector, or reviewed-byte change; on any network, credential, registry, cache, HOME, or `.boulder` isolation breach; on a missing or mismatched hash; or on a changed reviewer finding. Invalidated evidence cannot be patched by annotation and must be recaptured and rereviewed from the affected gate onward.

## Rollback

Before any merge, discard the K0R artifacts and retain no authority claim. If K0R artifacts are merged before a valid exit receipt, revert only those artifacts together and preserve the invalidation record separately; do not alter v1, defaults, profiles, root guidance, or historical evidence to manufacture passage. Release rollback is not authorized because K0R authorizes no release.

## Approval semantics

Architect and Critic approvals are independent, exact-byte attestations, not delegated authority to waive a gate. Both must approve all required bytes with zero unresolved findings. A failing, conditional, expired, stale, or missing approval is a block. Designated maintainer exact-byte approval of this proposed ADR is a separate required prerequisite to supersession and K0R exit, and it must occur after both exact reviews. Only after that approval and all remediation gates pass may a separate K0R exit receipt be approved; it grants only K0R exit status. It does not authorize K2, K3, K4, commit, push, merge, publication, release, a default or profile change, or any root-guidance action. Those actions remain forbidden during K0R and require their own later authority.

## Approval provenance

The user selected the superseding-ADR branch and approved the K0R execution scope. That authorization selects this remediation path only; it is not an approval of these exact ADR bytes.

Exact ADR-byte approval by the designated maintainer remains pending. No approval receipt is created or implied by this section. Until the designated maintainer approves these exact ADR bytes after the required independent Architect and Critic exact-byte reviews and a separate K0R exit receipt issues after every remediation gate passes, ADR 0003 remains active, this proposed ADR is not effective, and K0R exit cannot issue.
