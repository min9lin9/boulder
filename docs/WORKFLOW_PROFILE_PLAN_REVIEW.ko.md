# Boulder Workflow Profile 기획 검토

상태: implemented and verified
범위: workflow profile, profile resolution, tenant-safe handoff, GJC/LazyCodex 기본 profile, research/ops 확장
기준 문서: `plans/workflow-profiles.md`, `docs/BOULDER_FINAL_PRODUCT_PLAN.md`, `.omo/drafts/gjc-deep-interview-workflow-profile-review.md`

## 한 줄 결론

Boulder는 GJC/LazyCodex wrapper가 아니라, Codex 안에서 작업 유형별 workflow profile을 local-only로 resolve하고, 외부 adapter에는 sanitized handoff packet만 approval-gated로 연결하는 workflow operator kit가 되어야 한다.

## 제품 정의

Boulder의 기본 programming profile은 다음 조합을 사용한다.

| 역할 | 기본 adapter | 기본 model preference | 의미 |
| --- | --- | --- | --- |
| Planner | `Yeachan-Heo/gajae-code` | `kimi-k2.7` | deep interview와 계획 검토를 담당 |
| Executor | `lazycodex` | `gpt-5.5-medium` | 승인된 execution packet 기반 구현 담당 |
| Evaluator | `boulder` | local | tests, doctor, readiness, evidence 검증 |
| Compound | `boulder` | local | 반복 실패, 결정, 재사용 workflow 기록 |

중요한 점은 GJC와 LazyCodex가 Boulder의 본체가 아니라는 것이다. 둘은 `programming-default` profile의 adapter preference다. Boulder의 본체는 profile selection, profile resolution, handoff safety, verification gate, evidence record다.

## 정반합 검토

### 정

GJC와 LazyCodex를 기본값으로 두는 전략은 타당하다. 프로그래밍 작업에서 planning과 execution을 분리하면 모델별 강점을 살릴 수 있다.

- GJC는 deep interview와 계획 생성에 적합하다.
- LazyCodex는 bounded execution에 적합하다.
- Boulder는 두 도구 사이의 packet, gate, evidence를 관리할 수 있다.

이 조합은 초기 사용자에게 바로 쓸 수 있는 default workflow를 제공한다.

### 반

하지만 Boulder가 GJC/LazyCodex 중심으로 보이면 제품 범위가 좁아진다. 사용자가 원하는 핵심은 프로그래밍뿐 아니라 리서치, 운영, 반복 잡무, critic, compound 작업을 목적별 workflow로 분리하는 것이다.

또한 외부 model 전송은 tenant policy에 걸릴 수 있다. raw workspace file이나 `@plans/*.md`, `@src/*`를 외부 adapter에 그대로 넘기는 구조는 Boulder의 기본 동작이 되면 안 된다.

### 합

GJC/LazyCodex는 built-in `programming-default` profile로 유지한다. Boulder는 그 위에서 다음을 제공해야 한다.

- project-local workflow profile 저장과 전환
- `profile resolve`를 통한 local-only runtime contract compile
- task-class 기반 profile suggestion
- suggestion은 자동 use하지 않음
- tenant-safe handoff packet 생성
- 외부 send는 기본 blocked
- raw workspace content는 승인해도 forbidden

## 핵심 아키텍처

사용자 표면은 다섯 동사로 유지한다.

```text
intake -> plan -> execute -> verify -> record
```

내부 grammar는 8개 lane으로 profile 안에 숨긴다.

```text
intake
plan
critic
handoff
execute
verify
compound
record
```

Profile은 이 내부 lane들을 어떤 adapter, model preference, fallback, evidence policy로 묶을지 정한다.

## Profile Resolution Contract

`profile resolve`는 단순 config merge가 아니다. Boulder가 다음 command에서 사용할 workflow runtime contract를 local-only로 compile하는 단계다.

Resolution order:

```text
1. CLI explicit profile override
2. .boulder/current-profile
3. boulder.yaml legacy executors
4. built-in programming-default
```

주의할 점:

- task-class suggestion은 자동 전환이 아니다.
- `boulder profile resolve --task research`는 `research-default`를 추천할 수 있다.
- 하지만 selection order에 끼어들지 않는다. suggestion은 drift/info로만 표시된다.
- 실제 상태 변경은 `boulder profile use research-default`가 있어야 한다.
- `resolve`는 외부 model을 호출하지 않는다.
- `resolve`는 파일을 전송하지 않는다.

Resolved profile JSON은 다음 fixture 3개로 고정한다.

```text
fixtures/profiles/resolved/programming-default.json
fixtures/profiles/resolved/research-default.json
fixtures/profiles/resolved/ops-default.json
```

필수 필드:

```json
{
  "schemaVersion": "boulder.profile.resolved.v1",
  "source": "built-in",
  "id": "programming-default",
  "purpose": "programming",
  "surface": ["intake", "plan", "execute", "verify", "record"],
  "lanes": {},
  "externalPolicy": {},
  "fallback": {},
  "drift": [],
  "suggestion": {}
}
```

## Legacy Migration

기존 `boulder.yaml.executors`는 즉시 제거하지 않는다. project profile이 없을 때 legacy profile로 compile한다.

예시:

```yaml
executors:
  planning:
    preferred: custom-planner
    mode: detect-and-suggest
  execution:
    preferred: custom-executor
    mode: detect-and-suggest
  fallback:
    planning: codex
    execution: manual
```

resolved 결과:

```json
{
  "schemaVersion": "boulder.profile.resolved.v1",
  "source": "legacy-manifest",
  "id": "legacy-boulder-yaml",
  "purpose": "programming",
  "drift": [
    {
      "id": "profile.drift.legacy-executors",
      "severity": "info",
      "message": "Legacy boulder.yaml executors generated the active workflow profile."
    }
  ]
}
```

이 방식은 기존 repo를 깨지 않으면서 profile 기반 구조로 이동하게 한다.

## Drift Warning

`doctor`와 `profile resolve`는 다음 drift를 고정된 id로 보고해야 한다.

| id | 의미 | 심각도 |
| --- | --- | --- |
| `profile.drift.legacy-executors` | `boulder.yaml.executors`로 legacy profile을 생성함 | info |
| `profile.drift.current-missing` | `.boulder/current-profile`이 없는 profile을 가리킴 | warn |
| `profile.drift.manifest-differs` | active project profile과 legacy executors가 다름 | info |
| `profile.suggestion.not-applied` | task-class suggestion이 active profile과 다르지만 자동 적용하지 않음 | info |

이 warning들은 “실패”가 아니라 “현재 Boulder가 무엇을 기준으로 판단했는지”를 설명하는 장치다.

## CLI Contract

성공 JSON:

```bash
boulder profile resolve --json
```

- stdout: resolved profile JSON
- stderr: empty
- exit: 0

성공 human:

```bash
boulder profile resolve --task research
```

필수 출력:

```text
active-profile: programming-default
suggested-profile: research-default
suggestion-applied: false
source: built-in
```

실패:

```bash
boulder profile resolve --profile missing --json
```

- stdout: empty
- stderr:

```text
ERROR profile.not_found: Profile "missing" was not found.
```

- exit: 1

## Tenant-Safe Handoff

Boulder의 외부 adapter 통합은 다음 state machine을 따른다.

```text
packet -> review -> send
```

정책:

| 단계 | 기본 허용 | 외부 전송 | 설명 |
| --- | --- | --- | --- |
| `packet` | yes | no | sanitized packet 생성 |
| `review` | yes | no | packet 검토, validation, approval code 발급 |
| `send` | no | approval code 필요 | sanitized packet과 review code가 맞을 때만 전송 후보 |
| raw workspace | no | always forbidden | 승인해도 금지 |

기본 정책:

```yaml
externalAdapters:
  default: blocked
  requireExplicitApproval: true
  rawWorkspaceContent: forbidden
  sanitizedPacket: allowed-after-approval
```

금지되는 기본 통합:

```bash
gjc_delegate_plan --cwd . --task @plans/workflow-profiles.md
gjc_delegate_execute --cwd . --task @src/index.ts
lazycodex run --repo .
```

GJC Hermes bridge 자체 확인은 비파괴 smoke로만 허용한다.

```bash
gjc mcp-serve coordinator --check --json
gjc setup hermes --root . --smoke
```

허용되는 기본 통합:

```bash
boulder handoff packet --adapter gajae-code --json
boulder handoff review --packet .boulder/handoffs/gajae-code.json
```

blocked 기본값:

```bash
boulder handoff send --adapter gajae-code
```

필수 stderr:

```text
ERROR external.handoff.blocked: External adapter execution is blocked by default.
```

## 구현 상태

이번 구현은 다음 범위를 닫았다.

| 영역 | 구현 결과 | 검증 |
| --- | --- | --- |
| profile resolution | built-in, current-profile, legacy executor migration, drift warning, task suggestion | `test/workflow-profiles.test.ts`, `test/profile-cli-e2e.test.ts` |
| profile CLI | `list`, `show`, `save`, `use`, `resolve` | CLI e2e |
| pipeline/export/quickstart 연동 | active profile의 executor mode와 profile id를 반영 | `test/cli-pipeline-e2e.test.ts`, `test/profile-cli-e2e.test.ts` |
| tenant-safe handoff | sanitized packet, include metadata summary, review, send default blocked, protected/absolute path reject | `test/handoff-packet.test.ts`, `test/handoff-cli-e2e.test.ts` |
| 위조 packet 방어 | unknown key, redaction 미적용, approvalRequired false, raw workspace reference, adapter traversal을 reject | `test/handoff-cli-e2e.test.ts`, `test/handoff-packet.test.ts` |
| review receipt 방어 | SHA-256 packet digest와 review secret HMAC signature가 맞는 receipt만 허용하고 stale/forged receipt는 reject | `test/handoff-cli-e2e.test.ts`, `test/handoff-safety-e2e.test.ts` |
| packet path 방어 | `.boulder/handoffs` 밖의 explicit packet, symlink packet target, symlink handoff directory를 reject | `test/handoff-cli-e2e.test.ts` |
| doctor profile contract | `activeProfile`과 `profile.drift.*` issue를 report에 포함 | `test/capability-doctor.test.ts` |
| project profile parser | repo-controlled profile JSON의 lane owner/mode/adapter/purpose/surface를 fail-closed runtime guard로 검증 | `test/profile-cli-e2e.test.ts` |
| fixture contract | resolved profile fixture 3개가 8-lane 구조를 포함 | `test/workflow-profiles.test.ts` |

최종 verification:

```text
bun test: 131 pass
bun run ci: pass
LSP diagnostics on src/: 0 diagnostics
manual CLI QA: evidence/workflow-profiles/manual-cli-qa.txt
```

제한:

- AST MCP는 `Transport closed`로 실패했고, 로컬 `ast-grep --version`은 `permission denied`였다. AST 기반 검사는 이번 evidence에서 실행 성공으로 주장하지 않는다.
- code-review-graph Explorer는 호출됐지만 현재 graph가 0 community/0 node로 응답했다. 구조 이상 결합은 발견하지 못했지만, graph index 자체의 최신성은 별도 갱신이 필요하다.

명시 승인 후에도 raw reference가 있거나 안전 검증을 통과하지 못한 packet이면 실패해야 한다.

```bash
boulder handoff send --packet .boulder/handoffs/gajae-code.json --approve-external --approval-code <review-code>
```

## 구현 우선순위 및 완료 상태

### P0. Resolved Profile Contract

- 완료: `ResolvedWorkflowProfile` 타입 추가
- 완료: built-in resolved fixture 3개 추가
- 완료: `profile resolve` JSON/human 출력 고정
- 완료: legacy `boulder.yaml.executors` migration 고정
- 완료: drift warning 고정

### P0. Tenant-Safe Handoff

- 완료: `handoff packet` 추가
- 완료: `handoff review` 추가
- 완료: `handoff send`는 기본 blocked
- 완료: `--approve-external`은 sanitized packet만 허용
- 완료: raw workspace reference와 forged packet은 실패

### P1. Profile Commands

- 완료: `profile list`
- 완료: `profile show`
- 완료: `profile use`
- 완료: `profile save`
- 완료: `.boulder/current-profile`

### P1. Surface Integration

- 완료: `quickstart`는 active profile 기준으로 표시
- 완료: `pipeline`은 resolved profile 기준으로 route 표시
- 유지: `doctor`는 adapter availability와 profile preference를 분리
- 완료: `export`는 active profile을 기록

### P2. Profile Library

MVP에서는 built-in profile과 project-local saved JSON profile을 지원한다. user-global profile import/export는 나중으로 미룬다.

```bash
boulder profile import <path|url>
boulder profile export <name>
```

## 구현 전 체크리스트

- [x] resolved profile JSON fixture 3개가 작성됐다.
- [x] `profile resolve` stdout/stderr 예시가 테스트로 고정됐다.
- [x] task-class suggestion은 자동 use가 아님을 테스트했다.
- [x] legacy migration 예시가 테스트로 고정됐다.
- [x] drift warning id가 테스트로 고정됐다.
- [x] handoff send 기본 blocked가 테스트로 고정됐다.
- [x] raw workspace reference forbidden과 forged packet reject가 테스트로 고정됐다.

## 평가

| 항목 | 현재 계획 | 보강 후 목표 |
| --- | ---: | ---: |
| 제품 방향성 | 9.3 | 9.6 |
| 구현 명확성 | 8.6 | 9.5 |
| tenant safety | 8.8 | 9.6 |
| 외부 반복사용성 | 8.7 | 9.4 |
| Codex OSS 지원 적합도 | 9.1 | 9.5 |

최종 판단: 이 방향은 Boulder를 단순 OSS harness에서 workflow profile manager로 올린다. GJC/LazyCodex의 강점을 유지하면서도, research/ops/critic/compound workflow로 확장 가능하고, 외부 model 전송은 기본 차단하는 구조라 공개 OSS 제품으로 설명력이 높다.

## 결론

다음 구현은 `profile use`가 아니라 `profile resolve`부터 시작해야 한다. `resolve`가 Boulder의 신뢰 경계다. 이 contract가 고정되어야 `quickstart`, `pipeline`, `doctor`, `export`, `handoff packet`이 같은 판단 기준을 공유한다.
