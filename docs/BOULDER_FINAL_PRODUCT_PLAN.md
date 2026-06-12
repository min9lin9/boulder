# Boulder Final Product Plan

한 줄 정의: Boulder는 공개 OSS 저장소에서 AI 작업을 `intake -> plan -> execute -> verify -> record`로 나누고, 각 단계의 판단과 증거를 재사용 가능한 패킷으로 남기는 Codex workflow manager/evaluator다.

## 최종 구조

사용자 표면은 다섯 동사로 축소한다.

```text
intake -> plan -> execute -> verify -> record
```

내부 lifecycle grammar는 8 lanes를 유지하되 workflow profile 내부로 숨긴다. 사용자는 lane을 직접 조작하지 않고, Boulder가 friction, risk, approval, repo context에 따라 profile을 선택한다.

기본 역할은 다음과 같다.

| 역할 | 기본값 | 교체 가능 대상 | Boulder 책임 |
| --- | --- | --- | --- |
| Planner | GJC | Codex, human PM, custom planner | planning packet validation |
| Executor | LazyCodex | Codex worker, human engineer, CI bot | execution packet validation |
| Evaluator | Boulder | external reviewer | gates, readiness, decision evidence |
| Compound layer | Boulder | custom orchestrator | workflow profile, ledger, replay |

GJC와 LazyCodex는 기본 adapter이지 runtime dependency가 아니다. Boulder core는 둘을 설치하거나 실행하지 않고, 둘이 읽을 수 있는 packet과 증거 기준을 생성한다.

## Capability Doctor

기존 Codex 환경의 skills, MCP, plugins, runtimes를 AI가 인식하고 올바른 workflow lane에서 쓰게 하려면 `boulder doctor`가 필요하다.

MVP contract:

- inventory: `fixtures/capabilities/codex-installed.json`
- command: `boulder doctor [--json]`
- output: capability list, lane mapping, official-docs-first flag, runtime compatibility issues
- first warning: Gajae-Code live execution requires Bun `>=1.3.14`

이 기능은 사용자의 기존 환경을 Boulder가 흡수하는 장치다. 새 agent 생태계를 강요하지 않고, 이미 설치된 `ulw-plan`, `ulw-loop`, `programming`, `remove-ai-slops`, LSP, AST, MCP, Superpowers를 분류해 쓸 수 있게 한다.

## Field Evidence MVP

fixture-backed readiness를 field-backed readiness로 올리는 최소 단위는 `field-readiness` run이다.

필수 파일:

```text
evidence/field-readiness/<run-id>/activation-transcript.txt
evidence/field-readiness/<run-id>/first-readiness.json
evidence/field-readiness/<run-id>/second-readiness-delta.json
evidence/field-readiness/<run-id>/share-safe-artifact-url.txt
evidence/field-readiness/<run-id>/decision-log.json
evidence/field-readiness/<run-id>/official-docs-refresh.json
evidence/field-readiness/<run-id>/generated-metrics.json
```

기록 명령:

```bash
boulder record field-readiness --run-id <run-id> --evidence evidence/field-readiness/<run-id> --json
```

`service-readiness`는 이제 `field-evidence` gate를 본다. 단순한 문서 계획만으로는 pilot-ready가 될 수 없고, 실제 run evidence가 있어야 한다.

## Milestones

| 단계 | 목표 | 완료 조건 |
| --- | --- | --- |
| Contract MVP | planner/executor/evaluator 경계 검증 | workflow profile, handoff fixture, validator tests pass |
| Handoff MVP | GJC-style plan을 LazyCodex execution packet으로 변환 | handoff validation and manual QA evidence pass |
| Capability Doctor MVP | 설치된 skills/MCP/plugins/runtime을 lane으로 라우팅 | `boulder doctor --json` reports routing and runtime warnings |
| Field Evidence MVP | fixture-backed에서 local field-backed로 상승 | `record field-readiness` manifest and `service-readiness` field gate pass |
| External Maintainer MVP | public OSS maintainer가 재현 | public PR/issue/release evidence link and repeat-run metrics exist |

## Current Readiness

현재 결론은 보수적으로 잡는다.

- 기획 완성도: 95+ 가능. Capability Doctor와 Field Evidence MVP가 계획과 코드 표면에 들어갔다.
- 로컬 제품 상태: Field Evidence MVP-ready.
- 공개 서비스 상태: 아직 `service-ready`가 아니다. 외부 maintainer run, public install smoke, product-readiness evidence가 남아 있다.

즉 Boulder는 이제 “설치 후 반복 사용 가능한 CLI workflow의 핵심 contract”까지 왔다. 다음 상승 구간은 기능 추가가 아니라 외부 replay와 public evidence 축적이다.
