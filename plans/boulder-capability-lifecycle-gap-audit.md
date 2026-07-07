# Boulder Capability Lifecycle Gap Audit

Status: planning audit, not implementation plan
Date: 2026-07-04
Target worktree: `codex/bootstrap-designer-mvp`

## 문서 역할

이 문서는 capability lifecycle 허점을 고정하는 설계 감사 문서다. 바로 구현하는 작업 계획이 아니다.

실행 순서:

1. 현재 executable slice는 `.omo/plans/boulder-routine-retro-skill-loop.md`의 `routine capture -> retro weekly --dry-run -> skill propose` MVP다.
2. 그 다음은 `plans/boulder-existing-project-gap-remediation.md`의 P0 제품 보정이다.
3. 이 문서는 이후 별도 `.omo/plans/` implementation plan으로 변환한 뒤에만 구현한다.

따라서 아래 command/schema는 다음 구현 지시가 아니라 후속 계획의 계약 후보로 읽어야 한다.

## 결론

이전 허점 분석은 `routine -> retro -> skill proposal`에 너무 좁게 묶였다. Boulder의 실제 약한 지점은 “기능 추천”이 아니라 “추천 이후 capability가 프로젝트 안에서 어떤 상태로 운영되는지”다.

핵심 보정:

```text
candidate -> reviewed -> installed/detected -> bound -> used -> stale -> archive-plan
```

이 lifecycle이 없으면 skill archive, MCP 관리, subagent import, GJC/LazyCodex 전환, prompt preset 모두 개별 기능으로 흩어진다.

## 재조사 근거

- `src/bootstrap-interview.ts`: profile, subagent, skill/MCP/RAG/DB를 추천하지만 상태를 저장하거나 적용하지 않는다.
- `src/capability-source.ts`: GitHub/clawhub source candidate manifest는 만들지만 install/detected/bound/used 상태로 전이하지 않는다.
- `src/capability-doctor.ts`: local inventory와 source candidate를 함께 보고하지만 둘을 reconciliation하지 않는다.
- `src/capability-inventory.ts`: Codex skills/MCP/plugins를 scan하지만 last-used, usage-count, source provenance, owning profile을 알 수 없다.
- `src/workflow-profile-builtins.ts`: profile lanes는 adapter 중심이고 selected skill/MCP/subagent source id와 직접 결합하지 않는다.
- `.omo/plans/boulder-routine-retro-skill-loop.md`: routine recurrence와 skill archive는 계획됐지만 capability lifecycle ledger는 빠져 있었다.

## 누락된 핵심 허점

### P0. Usage Event Ledger 부재

`lastUsedAt`과 `usageCount`는 inventory scan으로 얻을 수 없다. Codex skill은 Boulder 밖에서 직접 호출될 수 있고, MCP도 Codex/plugin layer에서 쓰일 수 있다.

필요한 최소 설계:

```text
.boulder/usage/events.jsonl
```

이벤트 필드:

- `timestamp`
- `capabilityId`
- `kind`: `skill | mcp | plugin | adapter | agent-catalog | profile | preset`
- `profileId`
- `lane`
- `source`: `boulder-command | codex-skill | manual-record | imported-evidence`
- `evidencePath`: repo-relative path only
- `evidenceKind`
- `evidenceHash`
- `redactedNote`

MVP 명령 후보:

```bash
boulder capability usage --dry-run --json
boulder capability record-use --id <id> --kind <kind> --profile <profile> --lane <lane> --evidence <path> --write
```

Ponytail 판단: 자동 추적 hook을 만들지 않는다. 먼저 명시적 record와 read-only summary만 둔다.

보안 경계:

- `--evidence`는 repo-relative path만 허용한다.
- absolute path, `..`, NUL, path separator가 포함된 generated id, symlink escape는 거부한다.
- `.boulder/usage/events.jsonl`에는 증거 본문을 inline 저장하지 않는다. path/hash/kind/redacted note만 저장한다.
- 테스트는 `../`, absolute path, shell metacharacter, secret-like evidence fixture가 `.boulder/**`에 inline 저장되지 않는 케이스를 포함한다.

### P0. Capability Lifecycle State Machine 부재

현재는 `sourceCandidate`와 `inventory`가 분리돼 있다. 그래서 `https://github.com/Yeachan-Heo/gajae-code`를 import한 뒤 doctor가 `gjc_coordinator`를 발견해도 “이 후보가 실제 설치로 충족됐다”고 말할 수 없다.

필요 상태:

```text
configured-unverified
reviewed
detected
available
bound
used
stale
archive-candidate
archived
```

MVP에서는 mutation 없이 `doctor`가 reconciliation report만 출력한다.

```bash
boulder capability status --dry-run --json
```

혹은 기존 `doctor --json`에 `lifecycle` 필드를 추가해도 된다. 새 명령보다 기존 doctor 확장이 더 작다.

### P0. Profile-to-Capability Binding 부재

`bootstrap interview`는 selected subagents와 capability plan을 출력하지만, active profile이 어떤 skill/MCP/subagent/source candidate를 필요로 하는지 명시적으로 소유하지 않는다.

문제:

- `doctor`는 capability가 있는지 말하지만 “현재 profile이 필요한 capability가 충족됐는지”는 약하다.
- `agency-agents` catalog를 import해도 selected subset이 profile에 묶이지 않는다.
- private corpus/context-mode 같은 RAG source도 profile 요구사항으로 남지 않는다.

필요한 최소 스키마:

```json
{
  "profileId": "research-corpus",
  "requires": [
    { "kind": "skill", "id": "omo:ulw-research", "sourceRef": null, "required": true },
    { "kind": "mcp", "id": "context-mode", "sourceRef": null, "required": true },
    { "kind": "agent-catalog", "id": "agency-agents", "sourceRef": "github__msitarzewski__agency-agents", "selected": ["Research Analyst"] }
  ]
}
```

이것이 없으면 Boulder는 “추천 도구”와 “프로젝트가 실제 쓰는 도구”를 구분하지 못한다.

ID 규칙:

- profile-bound generated file id는 slug로 제한한다: lowercase alnum plus `-`, 80자 이하.
- capability display id는 `omo:ulw-research`처럼 provider separator를 가질 수 있지만, 파일명으로 쓸 때는 별도 slug로 canonicalize한다.
- routine id, source ref, archive candidate id는 path component로 직접 쓰기 전에 같은 slug 검증을 통과해야 한다.

### P0. Skill Archive 이전에 Archive Plan 기준이 없음

단순히 오래 안 썼다고 archive하면 안 된다. release-safe나 security/review skill은 자주 안 써도 중요한 capability일 수 있다.

archive 후보 기준은 최소 네 가지를 함께 봐야 한다.

- `lastUsedAt`
- `usageCount`
- `owningProfile`
- `criticality`: `required | optional | experimental`
- `replacement`: 대체 capability 존재 여부

명령은 write보다 plan이 먼저다.

```bash
boulder capability archive-plan --stale-days 90 --min-uses 0 --dry-run --json
```

금지:

- 자동 delete
- 자동 move
- profile required capability archive
- external telemetry

### P1. Source Freshness와 Update Plan 부재

GitHub URL로 관리한다는 방향은 맞지만, 지금 source candidate에는 commit/tag/default branch/head freshness가 없다.

필요한 read-only update surface:

```bash
boulder capability update-plan --dry-run --json
```

보고 항목:

- canonical source URL
- current detected version or commit
- latest known version or default branch head
- license/trust status
- breaking-change warning
- suggested action

중요: `doctor`는 진단이고 `update-plan`은 변화 계획이다. install/update apply는 별도 승인-gated 명령으로 분리한다.

네트워크/프라이버시 경계:

- 기본 `update-plan`은 offline inventory만 보고 `freshness: unknown`을 허용한다.
- live GitHub/docs 조회가 필요하면 후속 옵션 `--allow-network`로 분리한다.
- live 조회는 canonical GitHub/doc URL만 요청하고, workspace 파일, private corpus, usage ledger, prompt preset 본문을 전송하지 않는다.
- 테스트는 네트워크 없는 환경에서 명령이 실패하지 않고 offline 결과를 내는 케이스를 포함한다.

### P1. Official Docs Refresh Evidence 부재

`officialDocsFirst` 플래그는 있지만 “언제 어떤 공식문서를 확인했는지” evidence가 없다.

필요한 최소 파일:

```text
.boulder/docs-refresh/<capability-id>.json
```

필드:

- `capabilityId`
- `docsUrl`
- `checkedAt`
- `sourceType`: `official-docs | github-readme | package-docs`
- `summaryPath`
- `stalenessDays`

이것이 있어야 public OSS capability를 붙일 때 “공식문서 기반 최적화”라고 주장할 수 있다.

문서 refresh evidence도 본문 저장이 아니라 metadata-only를 기본으로 한다. 요약 파일을 만들더라도 raw docs/corpus/workspace 내용을 그대로 저장하지 않고 사람이 검토 가능한 짧은 redacted note만 둔다.

### P1. Profile Change History와 Rollback 부재

`profile use`는 현재 profile pointer만 바꾼다. 같은 프로젝트에서 programming/research/release workflow를 오가려면 이력과 rollback plan이 있어야 한다.

필요한 최소 설계:

```text
.boulder/profile-history.jsonl
```

필드:

- `timestamp`
- `fromProfile`
- `toProfile`
- `reason`
- `changedBy`
- `resolvedSummary`

명령 후보:

```bash
boulder profile history --json
boulder profile rollback-plan --dry-run --json
```

### P1. Prompt Preset Storage는 아직 구조만 필요

사용자가 LazyCodex/GJC 명령을 메모장에서 복붙하는 문제는 분명하다. 다만 지금 MVP에 넣으면 routine/retro/skill loop와 섞인다.

후속 스키마만 고정한다.

```text
.boulder/prompts/<preset-id>.md
```

필드:

- title
- target adapter
- profile
- lane
- variables
- safety notes
- lastUsedAt / usageCount는 usage ledger에서 계산

### P1. Private Corpus / RAG / DB Capability가 Source Candidate와 분리됨

`bootstrap interview`는 RAG/DB를 추천하지만 `capability import`는 현재 `skill | adapter | agent-catalog`만 받는다. 사용자의 private corpus, context-mode, DB/ledger는 project-local capability로 관리되어야 한다.

후속 kind:

```text
rag-source
db-ledger
context-provider
```

이 항목들은 특히 privacy policy가 필요하다.

### P2. Scheduled Routine은 Boulder Core가 아니라 Automation Contract

매일 아침/퇴근 전/주간 회고 같은 반복 작업은 필요하지만 Boulder가 daemon이 되면 제품 범위가 흔들린다.

정답은 외부 automation contract다.

```bash
boulder routine export-automation --dry-run --json
```

출력만 만들고 실제 예약은 Codex automation, cron, GitHub Actions, Calendar 등 외부 실행자에게 맡긴다.

## Lifecycle Plan으로 변환할 때의 작업 순서

이 감사 문서를 구현 계획으로 바꿀 때만 아래 순서를 사용한다.

1. usage event ledger schema와 path/id/evidence safety tests
2. doctor lifecycle reconciliation report
3. profile-to-capability binding report
4. read-only archive-plan

각 항목은 `.omo/plans/` 아래 별도 work plan에서 implementation+test 단위 todo로 쪼개야 한다. 이 감사 문서만으로 코드를 작성하지 않는다.

### 바로 구현하면 안 되는 것

1. 자동 skill archive
2. 자동 capability update/apply
3. 자동 subagent install
4. 자동 prompt execution
5. Boulder daemon/scheduler

## 수정해야 할 기존 계획

`.omo/plans/boulder-routine-retro-skill-loop.md`의 “Deferred skill management”는 너무 좁다. 현재 계획은 이를 “Deferred capability lifecycle management”로 확장해야 한다.

```text
Skill archive is a special case of capability lifecycle management. Boulder must first record usage events and reconcile source candidates with detected inventory before it can recommend archive candidates.
```

## 최종 판단

사용자가 알고 있었을 가능성이 높은 빠진 허점은 “스킬 archive” 자체가 아니라 “사용 이력을 누가, 어떻게, 어떤 신뢰도로 기록하느냐”다.

Boulder가 반복 사용 가능한 프로젝트 단위 workflow manager가 되려면 capability를 단순 목록이 아니라 lifecycle로 다뤄야 한다. 이 방향은 기존 Boulder의 원칙과 맞다.

- repo-local
- dry-run first
- doctor read-only
- update/apply 분리
- external call blocked by default
- profile 기반 workflow

후속 lifecycle 구현은 `skill usage`가 아니라 더 일반적인 `capability usage/lifecycle`부터 시작해야 한다. 다만 현재 즉시 실행 slice는 routine/retro/skill proposal MVP로 유지한다.
