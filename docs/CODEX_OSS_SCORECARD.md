# Codex OSS Scorecard

Status: draft rubric for local application-readiness

Official source: https://developers.openai.com/community/codex-for-oss accessed 2026-06-11.

This scorecard measures Boulder as an evidence-backed Codex OSS maintainer workflow kit. A 9.5+ result is local application-readiness for the Codex for OSS program, not an assurance of OpenAI acceptance.

Boulder framing:

- Boulder is the evidence-backed Codex OSS maintainer workflow kit.
- GJC is the planning/review lane for ambiguous or high-friction work.
- LazyCodex is the implementation lane that executes from approved planning evidence.
- Superpowers, GStack, and Compound are workflow contracts inside generated maintainer harnesses, not runtime dependencies.
- Core Boulder commands must remain local evidence and readiness gates; they must not launch providers, require credentials, or invoke external runtimes.

## Scoring Rules

Each dimension is scored from 0.0 to 10.0, multiplied by its weight, then summed into a 100-point readiness score. The final local readiness rating is `weighted total / 10`.

Weights sum to 100.

Evidence rules:

- A score above 8.0 requires linked evidence in the repository or an externally inspectable public artifact.
- A score at 9.5 or above requires exact commands, outputs, source links, limitations, and dated evidence.
- Private-only evidence may support internal confidence, but it does not count toward public proof.
- Unsupported claims must be removed or downgraded before scoring.
- Safety and product-readiness evidence cannot be averaged away by narrative quality.

## Weighted Dimensions

| Dimension | Weight | 9.5+ evidence rule |
| --- | ---: | --- |
| Official program fit | 20 | Maps Boulder evidence directly to Codex for OSS categories: pull request review, maintainer automation, release workflows, and other core OSS work. The application packet links each category to concrete public evidence. |
| Public OSS credibility | 15 | Shows a public repository, MIT license, installable package path, clear README, public support path, and public security posture. Release-facing docs must agree on package name, version, status, and limitations. |
| Repeatable workflow proof | 20 | Provides at least three public case-study runs with before/after state, commands, outputs, generated artifacts, operator conclusion, and limitations. At least two studies must be externally inspectable public repos or public artifacts. |
| Codex-specific value | 15 | Demonstrates that Codex-heavy maintainer work becomes safer through planning gates, GJC review evidence, LazyCodex implementation handoff, Boulder verification gates, and claim-to-evidence mapping. |
| Product readiness | 10 | Proves clean package contents, version truth, no duplicate files in package dry run, CI or equivalent local verification, M9 export/release evidence, product-readiness handoff evidence, and manual QA transcripts. |
| Safety and boundaries | 10 | Proves core commands do not launch providers, request credentials, call external runtimes, start background agents, or make provider SDK calls. Provider, credential, and runtime boundaries are documented and tested. |
| Narrative quality | 10 | Provides a concise, honest application packet with specific claims, dated evidence, official source mapping, known limitations, and no unsupported acceptance, adoption, runtime-scale, or security-access claims. |

## State Rows

| State | Official program fit | Public OSS credibility | Repeatable workflow proof | Codex-specific value | Product readiness | Safety and boundaries | Narrative quality | Local readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Current state | Plausible mapping exists in planning docs, but the application packet still needs public claim-to-evidence links for every official category. | Repository, license, package identity, and README evidence exist, but support/security posture and release-status consistency still need public confirmation. | Below target: fewer than three case studies are complete and fewer than two externally inspectable public studies are proven. | Strong workflow intent exists through Boulder, GJC, LazyCodex, and evidence gates, but handoff proof is not yet complete. | Below target while CLI version truth, package dry run cleanliness, M9 export/release evidence, and product-readiness handoff evidence remain unresolved. | Direction is strong because Boulder is not a runtime launcher, but release evidence must prove core commands do not launch providers, credentials, or external runtimes. | Planning language is strong, but the application packet must replace unsupported claims with dated evidence and limitations. | Below 9.0 until hard blockers are cleared. |
| Target state | Every official Codex for OSS category claimed by Boulder has linked public evidence and clear scope. | Public repo, license, install path, docs, support posture, security posture, and release state are consistent and inspectable. | Three or more case studies are complete, reproducible, and documented; at least two are externally inspectable public repo or public artifact studies. | Public evidence shows Codex maintainer workflows improved through planning/review, implementation handoff, and verification gates. | Package, version, CI, package dry run, M9 export/release evidence, product-readiness handoff evidence, and manual QA are clean. | Core commands stay local and bounded, with no provider launch, credential requirement, external runtime invocation, or background agent behavior. | The application packet is concise, specific, honest, evidence-backed, and explicit about limitations. | 9.5+ local application-readiness, subject to OpenAI review. |

## Hard blockers

Any hard blocker caps the local readiness score below 9.0 regardless of the weighted total:

- CLI version mismatch: the CLI version differs from `package.json`.
- Duplicate files in package dry run: package dry run includes duplicate `* 2.*` files.
- Missing M9 export/release evidence.
- Missing product-readiness handoff evidence: no product-readiness gate blocks missing GJC plan evidence or LazyCodex implementation evidence.
- Fewer than three case studies or fewer than two externally inspectable public studies.
- Unsupported acceptance/adoption/runtime-scale/security-access claims in the application packet or scorecard.
- Missing support/security posture in public docs.
- Core commands launching providers/credentials/external runtimes, including provider SDK calls, credential prompts, background runtime starts, or external agent runtime invocation.

## Evidence Checklist

Before claiming 9.5+ local readiness, the application packet must link to evidence for:

- Official program fit: pull request review, maintainer automation, release workflow, and core OSS work.
- Public OSS credibility: repository, license, install path, README, issue/support posture, and security posture.
- Repeatable workflow proof: three public case studies with commands, outputs, before/after evidence, and limitations.
- Codex-specific value: GJC planning/review lane evidence, LazyCodex implementation lane evidence, and Boulder verification evidence.
- Product readiness: CLI version truth, package dry run cleanliness, M9 export/release evidence, CI or equivalent verification, and manual QA.
- Safety and boundaries: no provider call, no credential handling, no runtime launcher, and no autonomous external agent invocation in core commands.
- Narrative quality: every meaningful claim has an evidence link, and limitations are visible.

## Claim Policy

Allowed claims:

- Boulder is a local OSS maintainer workflow kit for evidence-backed Codex workflows.
- Boulder can prepare evidence for Codex for OSS application review when public proof is complete.
- GJC and LazyCodex are handoff lanes, not mandatory Boulder runtime dependencies.
- Superpowers, GStack, and Compound are workflow contracts, not active runtime dependencies.

Disallowed until public evidence exists:

- Acceptance outcome claims.
- Adoption or user-scale claims.
- Runtime-scale claims.
- Security-access claims.
- Claims that external OSS usage proves Boulder adoption.
