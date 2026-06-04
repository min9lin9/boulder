# Provider Policy

Default provider surface: Codex.

External providers are optional and must be approval-gated.

Rules:

- Do not send secrets, private user data, or protected files to external providers.
- Treat external provider output as advisory until verified locally.
- Record provider usage in evidence notes when it affects a maintainer decision.
- Prefer local verification commands over model summaries.
