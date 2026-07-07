# Bootstrap Interview Research

Boulder bootstrap interview should select a project-local workflow profile and capability plan, not only a subagent list.

## Basis

- Hierarchical Task Analysis: ask for the repeated work goal, sub-goals, operations, and completion evidence before choosing tools.
- Cognitive Task Analysis: elicit expert decision points, exceptions, and knowledge sources instead of asking only for preferred agents.
- ReAct: separate reasoning, action, and tool-use needs; this maps to skills, MCP servers, and approval-gated commands.
- Retrieval-Augmented Generation: knowledge-intensive work needs explicit RAG sources with provenance, not only a bigger prompt.
- Balanced team roles: keep subagents as a small role mix per profile; avoid installing a whole catalog by default.

## Capability Dimensions

Bootstrap interview reports five dimensions:

- `selectedSubagents`: profile-scoped agents from `https://github.com/msitarzewski/agency-agents`.
- `capabilityPlan.skills`: local Codex skills needed for the work.
- `capabilityPlan.mcpServers`: context/tool servers needed for the work.
- `capabilityPlan.rag`: source sets that should ground the workflow.
- `capabilityPlan.db`: ledgers or durable state stores needed for repeat use.

## Scoring Rubric

`boulder bootstrap interview` is a deterministic guidance report. It does not classify with an LLM, install tools, call external models, or change active profile state.

The JSON output includes:

- `profileScores`: task-to-profile fit scores for `programming-heavy`, `research-corpus`, `release-safe`, `issue-triage`, and `docs-reviewer`.
- `capabilityScores`: setup-need scores for `subagents`, `skills`, `mcpServers`, `rag`, and `db`.
- `recommendationRationale`: short user-facing reasons plus next-action guidance. Copy-paste commands stay in the separate `commands` array.

Score semantics:

- `score` is an integer from `0` to `100`.
- `matchedSignals` lists normalized task signals. It is non-empty when a score is positive.
- `profileScores` sorts by score descending, then the stable built-in profile order.
- `capabilityScores` sorts by score descending, then the stable capability dimension order.
- `recommendedProfile` is always `profileScores[0].profileId`.

The rubric uses task text only in this MVP. The printed questions are planning prompts, not an interactive answer parser. A later `--answer` surface can extend the same contract without changing the current read-only behavior.

## Basis Mapping

- Hierarchical Task Analysis maps to repeated workflow, sub-goals, operations, and completion evidence.
- Cognitive Task Analysis maps to decision points, exceptions, and expert knowledge sources.
- ReAct maps to separated reasoning/action/tool needs across skills, MCP servers, and approval-gated commands.
- Retrieval-Augmented Generation maps to explicit source sets, provenance, and citation ledgers.
- NASA-TLX is not treated as a psychometric instrument here; Boulder uses friction, risk, and approval gates as a lightweight workload proxy.
- Balanced team roles map to a small profile-scoped subagent mix instead of broad catalog installation.
- MCP tool/resource/prompt concepts map to explicit `mcpServers` capability planning and `doctor` verification.

## Sources

- ReAct: https://arxiv.org/abs/2210.03629
- Retrieval-Augmented Generation: https://arxiv.org/abs/2005.11401
- Cognitive Task Analysis transcript parsing: https://arxiv.org/abs/1906.11384
- Task analysis overview: https://en.wikipedia.org/wiki/Task_analysis
- Belbin team roles overview: https://www.belbin.com/about/belbin-team-roles
