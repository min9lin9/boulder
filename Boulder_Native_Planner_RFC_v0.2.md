> BOULDER / PRODUCT & ENGINEERING RFC

# Boulder Native Planner

**Implementation-Ready RFC 및 설계 평가**

기존 Plan-Critic-Handoff 구조를 보존하면서 Gajae Code와 LazyCodex의 장점을 선별해, 외부 플래너가 없어도 일관된 계획 계약을 생성하는 Boulder 독자 Planner Harness 설계

> **최종 설계 결론**
>
> 조건부가 아니라 구현 착수 가능한 RFC로 승인한다. Boulder Native Planner는 새 파이프라인이 아니라 기존 plan lane의 로컬 adapter/harness로 추가한다. programming-default의 Gajae Code 선호는 유지하고, 첫 출시는 --planner boulder-native 또는 boulder-native-preview 프로파일로만 제공한다. 기존 boulder.handoff.v1은 변경하지 않는다.

| **항목**        | **결정**                                                                            |
|-----------------|-------------------------------------------------------------------------------------|
| 문서 상태       | Approved for implementation / RFC v0.2                                              |
| 기준 코드베이스 | min9lin9/boulder main / package 0.1.16                                              |
| 벤치마크 기준   | Yeachan-Heo/gajae-code, code-yeongyu/lazycodex 공식 저장소                          |
| 작성일          | 2026-07-14                                                                          |
| 개발 범위       | Contract -\> State -\> Analyzer -\> Critic -\> Execution packet -\> Preview rollout |
| 기본값 변경     | 보류. field benchmark와 반복 실행 증거 이후 별도 승인                               |

| 설계 준비도 | 착수 판정 | 기본값 전환 |
| --- | --- | --- |
| **98.4 / 100** | **GO** | **HOLD** |

주의: 98.4점은 구현 준비도 점수이며, 실제 planner 성능이나 GJC/LazyCodex 대비 우월성을 뜻하지 않는다.

# 0. 문서 사용법과 이번 개정의 의미

이 문서는 “무엇을 만들 것인가” 수준을 넘어, 구현자가 추가 설계 결정을 하지 않아도 첫 PR을 시작할 수 있도록 스키마, 상태 전이, CLI, 오류, 보안, 테스트, 벤치마크, 롤아웃 기준을 고정한다.

| **독자**    | **주로 볼 장** | **사용 목적**                             |
|-------------|----------------|-------------------------------------------|
| Maintainer  | 1, 15, 18      | GO/HOLD 결정, default 전환 승인           |
| Implementer | 6-13           | 타입, 파일, 상태, CLI, PR 순서 구현       |
| Reviewer    | 8-12, 14, 17   | 패킷 불변식, 승인, 보안, 추적성 확인      |
| Operator    | 3, 6, 10, 16   | 언제 질문하고 어떤 명령을 실행하는지 이해 |

## 0.1 91.6점 문서에서 닫은 설계 공백

| **이전 공백**      | **v0.2 보강 내용**                                                               | **완료 기준**                             |
|--------------------|----------------------------------------------------------------------------------|-------------------------------------------|
| 필드 목록만 존재   | 5개 versioned artifact의 필수 필드, 예시, digest, 불변식 정의                    | validator가 stable error id로 fail closed |
| 상태 이름만 존재   | 전이 guard, idempotency, revision, stale receipt, drift, concurrency 정의        | 불법 전이가 테스트에서 모두 실패          |
| CLI 이름만 제안    | 명령, 옵션, 쓰기 여부, JSON/human 출력, 오류 포맷, parser 변경점 확정            | e2e에서 글로벌 옵션 위치 회귀 없음        |
| 위험도 개념만 존재 | 5개 차원, 가중치, 0-4 level, 임계값, hard override, 경계 상향 규칙 확정          | 동일 입력은 항상 동일 분석 결과           |
| Critic 역할만 정의 | 구조 Critic, 의미 Critic, digest join gate, revision cap, approval receipt 확정  | stale/missing review로 approval 불가      |
| 일반적 안전 원칙   | 경로, receipt replay, prompt injection, command trust, 외부 전송 위협 모델 정의  | negative security tests 통과              |
| 테스트 범주만 존재 | 파일별 테스트, named cases, property/negative/regression, static scan 정의       | Phase별 exit gate 수치화                  |
| 3개 예시만 존재    | 별도 planner benchmark schema, 100점 rubric, promotion threshold, 반복 설계 확정 | default 전환 기준이 재현 가능             |
| 단계적 구현만 존재 | 8개 PR의 파일/테스트/rollback/exit gate 확정                                     | 각 PR이 독립적으로 merge/revert 가능      |

## 0.2 용어와 경계

| **용어**           | **정의**                                                                                                    |
|--------------------|-------------------------------------------------------------------------------------------------------------|
| Planner            | 의미적 계획을 작성하는 주체. Boulder Native skill, GJC, Codex, 사람, custom adapter가 될 수 있다.           |
| Planner Harness    | Boulder가 소유하는 분석, 상태, 스키마, 검증, Critic, 승인, 패킷 생성 골격. provider 호출을 소유하지 않는다. |
| Planning packet    | 결정 완료 계획의 내부 계약. repo-local이며 외부 handoff packet과 다르다.                                    |
| Execution packet   | 승인된 planning packet에서 단방향으로 파생되는 실행 계약. scope 확대 금지.                                  |
| Handoff packet     | 외부 adapter에 보내는 summary-only, redacted, approval-gated 경계 패킷. 기존 v1 유지.                       |
| Plan approval      | 계획 내용에 대한 승인. product mutation 권한이 아니다.                                                      |
| Execution approval | 실행자가 파일 변경 또는 명령 실행을 시작할 권한. plan approval과 별도다.                                    |

# 1. 경영 및 기술 요약 \[B1\]\[B2\]\[B3\]\[B4\]\[B5\]

Boulder는 이미 profile resolution, plan/critic/handoff/execute/verify lane, 외부 승인 정책, low/medium/high friction pipeline을 갖고 있다. 하지만 현재 pipeline은 task별 decision-complete plan을 생성하지 않고, programming-default는 plan을 Gajae Code에, execute를 LazyCodex에 연결한다. Native Planner의 목적은 기존 구조를 바꾸는 것이 아니라 plan lane이 소비할 수 있는 로컬 계획 계약을 채우는 것이다.

## 1.1 승인된 핵심 결정

> **1.** Adapter id는 boulder-native로 고정한다. 첫 출시는 명시적 override 또는 boulder-native-preview 프로파일만 허용한다.
>
> **2.** programming-default의 preferred plan adapter인 gajae-code와 execute adapter인 lazycodex는 변경하지 않는다.
>
> **3.** CLI는 deterministic analyzer, store, validator, receipts, packet conversion만 담당한다. 의미적 질문과 계획 작성은 host-agent skill 또는 외부 planner가 담당한다.
>
> **4.** boulder.planning-packet.v1, boulder.critic-review.v1, boulder.plan-approval.v1, boulder.execution-packet.v1을 신규 정의한다.
>
> **5.** 기존 boulder.handoff.v1 및 boulder.handoff.review.v1의 schema와 동작은 byte-level 회귀 테스트로 보호한다.
>
> **6.** 모든 mutation 실행은 plan approval과 execution approval을 분리한다. direct mode는 질문을 생략할 뿐 승인을 생략하지 않는다.
>
> **7.** ResolvedWorkflowProfile v1의 fallback.plan은 단일 string이므로 multi-hop fallback을 억지로 넣지 않는다. 필요 시 profile schema v2로 별도 제안한다.

## 1.2 GO / HOLD / NO-GO

| **판정** | **범위**                                                                                     | **이유**                                                |
|----------|----------------------------------------------------------------------------------------------|---------------------------------------------------------|
| GO       | 스키마, validator, safe store, analyzer, Critic, receipts, execution packet, preview profile | 기존 lane과 안전 경계를 재사용하며 독립적으로 검증 가능 |
| HOLD     | boulder-native를 programming-default의 preferred 또는 first fallback으로 승격                | 동일 rubric field evidence가 아직 없음                  |
| NO-GO    | CLI provider 호출, package install, credential injection, external launch, handoff v1 확장   | 현재 product boundary와 fail-closed 정책 위반           |

## 1.3 제품 한 줄 정의

> **Boulder Native Planner**
>
> 저장소 근거와 승인 정책을 사용해 “질문이 필요한 일”과 “질문 없이 계획할 수 있는 일”을 구분하고, 독립 Critic과 명시적 승인으로 검증된 실행 패킷을 만드는 local-first Planner Harness다.

# 2. 현행 코드베이스 통합 지도 \[B3\]\[B4\]\[B5\]\[B7\]\[B8\]\[B9\]\[B10\]\[B11\]\[B12\]\[B13\]

| **현행 구성**       | **공식 구현 사실**                                                                                | **Native Planner 처리**                                                   |
|---------------------|---------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------|
| Lane/profile        | ResolvedWorkflowProfile은 intake, plan, critic, handoff, execute, verify, compound, record를 보유 | lane 추가 금지. plan/critic/handoff를 채움                                |
| Programming default | plan=gajae-code, execute=lazycodex, fallback은 단일 string                                        | 기본값 유지. preview profile과 local override만 추가                      |
| Pipeline            | low/medium/high가 stage와 approval gate를 결정하며 provider 등 side effect를 금지                 | mode 최소값과 friction을 연결하되 pipeline 출력은 초기 PR에서 불변        |
| CLI dispatcher      | src/cli.ts의 단일 dispatcher와 GLOBAL_VALUE_FLAGS/BOOLEAN_FLAGS 사용                              | plan-command.ts로 위임하고 새 value flag를 global set에 추가              |
| Option parser       | shared CliOptions.runId 기본값은 field-run이며 field evidence 용도                                | plan run id는 plan-command에서 별도 UUID 생성. shared default 재사용 금지 |
| Safe writes         | fs.ts와 handoff-paths.ts가 symlink/hardlink/no-follow/atomic replace를 구현                       | plan-store가 같은 패턴을 재사용하고 .boulder/plans만 허용                 |
| Review receipt      | handoff review는 SHA-256, HMAC, nonce, approval code를 packet text에 결합                         | 새 receipt는 domain-separated schema 사용. 기존 format 불변               |
| Run events          | run-event.v1은 terminal operational event와 safe local storage를 제공                             | planning state는 별도 artifact. terminal plan event만 run-event에 기록    |
| Benchmark           | 현재 benchmark는 harness contract/claim discipline만 검사하고 model leaderboard를 금지            | planner benchmark는 별도 schema/command로 분리                            |
| Codex skill         | skills/boulder는 local wrapper와 five-verb 흐름을 제공                                            | 별도 boulder-native-planner skill을 추가하고 boulder skill에서 안내       |

## 2.1 반드시 지킬 최소 변경 규칙

> **• 프로파일 호환성:** boulder.profile.resolved.v1의 required lane과 fallback string shape를 Phase 1-4에서 변경하지 않는다.
>
> **• CLI 호환성:** global option이 command 앞에 위치하는 기존 e2e 동작을 보존한다. 새 value flag는 GLOBAL_VALUE_FLAGS에 추가한다.
>
> **• 상태 격리:** 운영 run event와 planner run state를 혼합하지 않는다. planner 상태는 .boulder/plans/\<runId\>/state.json에 둔다.
>
> **• 보안 재사용:** writeGeneratedText 또는 handoff 수준의 no-follow, symlink, hardlink, workspace containment 검사를 통과한 경로만 쓴다.
>
> **• 외부 경계:** raw workspace가 필요한 내부 planning/execution packet을 외부 handoff packet으로 직렬화하지 않는다.
>
> **• 기본값 보존:** preview가 안정화되어도 default 전환은 별도 RFC, semver minor 이상, evidence packet을 요구한다.

## 2.2 현행 타입과 충돌하지 않는 출시 방식

> **중요한 정정**
>
> 이전안의 “gajae-code -> boulder-native -> codex” multi-hop fallback은 현재 profile v1의 fallback.plan: string과 직접 표현되지 않는다. v0.2는 이를 구현하지 않는다. 최초 릴리스는 --planner boulder-native와 boulder-native-preview로만 제공하고, multi-hop은 profile.resolved.v2가 필요할 때 별도 설계한다.

# 3. 문제 정의, 사용자 가치, 성공 기준

## 3.1 문제 정의

Boulder는 어떤 lane과 adapter를 사용할지 결정할 수 있지만, 외부 planner 없이도 repository evidence를 수집하고, owner decision만 질문하며, executor가 추가 판단 없이 수행할 수 있는 계획을 작성·검토·승인·패킷화하는 native contract가 없다. 그 결과 GJC가 미설치이거나 외부 handoff가 승인되지 않은 경우 계획 품질은 host agent의 암묵적 행동에 의존한다.

## 3.2 주요 사용자 작업

| **사용자 작업**           | **현재 마찰**                                          | **목표 경험**                                           |
|---------------------------|--------------------------------------------------------|---------------------------------------------------------|
| 작은 버그 수정 계획       | medium pipeline 또는 불필요한 인터뷰 가능              | 0개 질문, 정확한 path/AC/test plan                      |
| 여러 파일 기능 계획       | repo 사실과 owner preference가 섞임                    | repo 사실은 자동 조사, owner fork만 최대 3개 질문       |
| 보안/마이그레이션/release | 위험과 승인 범위가 planner마다 다름                    | hard override, deep mode, 명시적 risk/rollback/approval |
| GJC 미설치 환경           | fallback=codex만 표시되고 Boulder native policy가 없음 | boulder-native-preview로 동일 packet contract 생성      |
| 다른 planner 교체         | 산출물 형식이 도구별로 달라 handoff가 비공식           | planner-neutral packet validator와 one-way conversion   |

## 3.3 성공 지표

| **지표**                  | **정의**                                             | **출시 기준**                  |
|---------------------------|------------------------------------------------------|--------------------------------|
| question_count            | run당 사용자 질문 수                                 | direct=0, focused\<=3          |
| owner_decision_yield      | 질문 중 plan decision을 실제 변경한 비율             | focused benchmark 평균 \>= 70% |
| executor_judgment_count   | executor가 추가 선택해야 한 항목 수                  | 승인 packet당 0                |
| verification_traceability | AC가 verification/evidence에 연결된 비율             | 100%                           |
| scope_violation_count     | execution result가 allowed path/non-goal을 벗어난 수 | 0 critical, 전체 0 목표        |
| critic_iteration_count    | PASS까지 revision 횟수                               | median \<= 1, max 3            |
| stale_receipt_acceptance  | packet 변경 후 옛 receipt가 수용된 횟수              | 0                              |
| unsafe_write_acceptance   | symlink/hardlink/outside path 쓰기 성공 횟수         | 0                              |

## 3.4 비목표

> **•** LLM runtime, model router, swarm runtime 또는 tmux orchestration 재구현
>
> **•** Gajae Code Deep Interview 전체 상태 머신 복제
>
> **•** LazyCodex execution loop와 agent catalog 복제
>
> **•** planner score를 실제 정확도 또는 모델 품질로 주장
>
> **•** 계획 승인으로 product mutation을 자동 시작
>
> **•** 기존 five-verb 사용자 표면(intake -\> plan -\> execute -\> verify -\> record) 확대

# 4. 벤치마킹 원칙과 채택 범위 \[G1\]\[G2\]\[G3\]\[L1\]\[L2\]

벤치마킹은 기능 복제가 아니라 실패 방지 원칙의 선별이다. Boulder는 “언제 묻는가, 무엇을 근거로 삼는가, 어떤 계획이 실행 가능한가, 승인과 실행을 어떻게 분리하는가”를 가져오고, 각 프로젝트의 runtime/배포 구조는 복제하지 않는다.

| **출처**             | **채택**                           | **Boulder 적용**                                                     | **채택하지 않음**                                     |
|----------------------|------------------------------------|----------------------------------------------------------------------|-------------------------------------------------------|
| Gajae Deep Interview | Suitability Gate                   | clear/bounded/low-risk는 direct로 즉시 우회                          | 모든 작업에 수학적 ambiguity loop 적용                |
| Gajae Deep Interview | evidence before asking             | repo에서 확인 가능한 사실은 sourceRef로 해결                         | 사용자에게 코드베이스 사실 재질문                     |
| Gajae Deep Interview | weakest unresolved dimension       | deep mode에서 가장 큰 open dimension을 한 번에 하나 질문             | 질문 batch 및 반복 질문                               |
| Gajae Ralplan        | Planner/Architect/Critic 독립 검토 | planner packet digest에 독립 semantic review 결합                    | tmux/subagent persistence runtime 복제                |
| Gajae Ralplan        | approval is separate from planning | review -\> plan approval -\> execution packet -\> execution approval | plan approval 후 자동 실행                            |
| LazyCodex ulw-plan   | explore before asking              | discoverable fact는 read-only 조사                                   | 질문으로 조사 비용 전가                               |
| LazyCodex ulw-plan   | decision-complete plan             | exact paths, non-goals, dependency, AC, QA, evidence                 | sticky plan mode로 작은 direct 요청까지 강제 planning |
| LazyCodex            | durable draft and resume           | state.json + revisions + digest receipts                             | OmO 전체 distribution/model routing                   |

## 4.1 Boulder 고유 차별점

> **• 계약 중심:** planner와 executor의 품질을 특정 agent 이름이 아니라 versioned packet으로 관리한다.
>
> **• 외부 경계 분리:** internal plan/execution packet과 external sanitized handoff를 명시적으로 분리한다.
>
> **• 결정론적 안전 골격:** 분석, validation, digest, receipts, state, path policy는 모델이 아니라 CLI가 소유한다.
>
> **• 교체 가능성:** GJC, Native, Codex, human planner가 동일 planning-packet.v1을 생산할 수 있다.
>
> **• 증거 기반 승격:** 기본값 변경은 popularity나 감이 아니라 공통 rubric과 field evidence로 결정한다.

# 5. 최종 아키텍처와 책임 경계

## 5.1 전체 흐름

```text
USER TASK
   |
   v
Boulder intake / RepoInspection / active profile
   |
   v
Deterministic PlanAnalysis v1
   |-- direct  : 0 questions
   |-- focused : owner decisions only, max 3
   `-- deep    : weakest open dimension, one at a time
   |
   v
Planner producer (boulder-native skill | GJC | Codex | human)
   |
   v
PlanningPacket v1 -> Structural Critic -> Semantic Critic
   |                                      |
   +--------------- digest join gate -----+
   |
   v
Plan review receipt -> explicit plan approval receipt
   |
   v
ExecutionPacket v1 (scope may only stay equal or shrink)
   |
   +--> local executor
   `--> existing sanitized HandoffPacket v1 + external approval
   |
   v
Boulder verify -> decision log -> record
```

## 5.2 CLI와 host-agent skill의 책임 분리

| **책임**         | **Boulder CLI**                              | **Boulder Native skill / planner producer**          |
|------------------|----------------------------------------------|------------------------------------------------------|
| Repository facts | inspect/manifest/profile/source digest 제공  | read-only 탐색, sourceRef 선택                       |
| Mode decision    | deterministic score/override/precedence 계산 | 분석 결과를 따르고 owner decision만 질문             |
| Question text    | 질문 필요 여부와 open dimension 제공         | 자연어 질문 생성, 한 번에 하나                       |
| Plan content     | schema scaffold/validator/store 제공         | objective, decisions, tasks, AC, QA, risks 작성      |
| Critic           | structural checks와 review artifact contract | 독립 semantic critique와 verdict 생성                |
| Approval         | HMAC receipt, digest, stale check            | 사용자에게 요약과 선택지 제시                        |
| Provider calls   | 금지                                         | host 환경이 명시적으로 허용할 때만 외부 adapter 사용 |
| Execution        | 금지                                         | 별도 execute lane의 책임                             |

## 5.3 Planner-Critic-Handoff 불변 경계

> **설계 불변식**
>
> Planner는 product code를 쓰지 않는다. Critic은 planning packet을 수정하지 않고 review artifact만 만든다. Handoff builder는 승인된 planning packet을 execution packet으로 변환하되 scope를 확대하지 않는다. Executor는 classification, planning interpretation, public readiness claim, maintainer decision을 소유하지 않는다.

# 6. Deterministic Task Analyzer 명세

## 6.1 입력과 출력

| **구분** | **내용**                                                                                                                                                      |
|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 입력     | task text, explicit friction/mode, RepoInspection, boulder manifest, active profile, protected paths, known verification commands                             |
| 출력     | boulder.plan-analysis.v1: dimension levels, weighted score, reasons, hard overrides, selected mode, approval minimum, question budget, planner recommendation |
| 금지     | provider call, package install, git command 실행, product file mutation, arbitrary shell command 실행                                                         |
| 결정성   | 동일 normalized task + 동일 inspection/profile/manifest = byte-equivalent canonical JSON                                                                      |

## 6.2 5개 차원과 계산식

| **차원**         | **가중치** | **0점 상태**                         | **4점 상태**                                     |
|------------------|------------|--------------------------------------|--------------------------------------------------|
| ambiguity        | 25         | target/scope/AC가 명확               | target/scope/AC가 누락·충돌                      |
| impact           | 20         | read-only 또는 한 파일 국소 변경     | repo-wide/public API/packaging/release           |
| irreversibility  | 20         | 되돌릴 수 있는 local change          | data loss, irreversible migration, prod mutation |
| externality      | 15         | local existing tools only            | credential/provider/publish/external side effect |
| verification_gap | 20         | 기존 deterministic test/command 존재 | 검증 방법이 없거나 관측 불가                     |

**계산과 임계값**

```text
level(dimension) in {0,1,2,3,4}
weighted(dimension) = round(level / 4 * weight)
totalScore = sum(weighted dimensions)  # 0..100

0..24   -> direct  / low friction
25..54  -> focused / medium friction
55..100 -> deep    / high friction

Boundary rule: confidence=low and score is within 5 points of a threshold -> upgrade one mode.
Explicit higher friction may upgrade. Explicit lower friction may not bypass a hard override.
```

## 6.3 Level 결정 규칙

| **차원**         | **Level 0-1**                     | **Level 2**                             | **Level 3-4**                                                |
|------------------|-----------------------------------|-----------------------------------------|--------------------------------------------------------------|
| ambiguity        | exact path/symbol + measurable AC | clear outcome, implementation fork 존재 | owner decision 또는 outcome 자체가 불명확                    |
| impact           | docs/one file/local function      | multiple files in one component         | cross-component/public contract/release                      |
| irreversibility  | read-only/reversible edit         | rollback 가능한 migration               | destructive/persistent/no credible rollback                  |
| externality      | existing local command            | new dependency or network read          | credential, provider, publish, external write                |
| verification_gap | existing test and expected signal | partial tests/manual QA 일부            | no test path, observability required, unknown success signal |

## 6.4 Hard override와 최소 정책

| **Signal**                                              | **최소 mode** | **필수 승인/산출물**                                          |
|---------------------------------------------------------|---------------|---------------------------------------------------------------|
| auth, authorization, security, PII, secret, compliance  | deep          | security risk, negative tests, plan+execution approval        |
| data migration, deletion, destructive operation         | deep          | backup/rollback, failure recovery, explicit owner approval    |
| release, publish, production deployment                 | deep          | release checklist, rollback, external approval if applicable  |
| public API/config/schema/packaging change               | focused       | compatibility decision, migration note, plan approval         |
| new external dependency or pinned SHA                   | focused       | dependency rationale, license/security check, owner decision  |
| credential access or external provider call             | deep          | external policy, sanitized packet, separate external approval |
| user explicitly requests interview/high-accuracy review | deep          | question loop and semantic critic required                    |

## 6.5 질문 정책

| **Mode** | **질문 수**               | **질문 대상**                                             | **완료 gate**                                                       |
|----------|---------------------------|-----------------------------------------------------------|---------------------------------------------------------------------|
| direct   | 0                         | 없음. reversible default는 decision source=default로 기록 | objective, scope, AC, verification, approval이 모두 존재            |
| focused  | 최대 3, 한 번에 1개       | repo가 답할 수 없는 owner decision만                      | owner decision 0개 open + packet completeness                       |
| deep     | 고정 상한 없음, 반복 금지 | 가장 약한 unresolved dimension                            | blocked unknown 0, high-impact assumptions 확인, closure audit PASS |

## 6.6 PlanAnalysis v1 예시

```json
{
  "schemaVersion": "boulder.plan-analysis.v1",
  "runId": "5a9c8d44-...",
  "taskHash": "sha256:...",
  "requestedFriction": null,
  "selectedMode": "focused",
  "score": 42,
  "confidence": "high",
  "dimensions": [
    {"id":"ambiguity","level":2,"points":13,"reasons":["public config choice unresolved"]},
    {"id":"impact","level":2,"points":10,"reasons":["multiple files, one component"]},
    {"id":"irreversibility","level":0,"points":0,"reasons":["reversible code change"]},
    {"id":"externality","level":1,"points":4,"reasons":["existing local tools only"]},
    {"id":"verification_gap","level":3,"points":15,"reasons":["integration QA not specified"]}
  ],
  "hardOverrides": [],
  "questionBudget": 3,
  "approvalMinimum": ["plan", "execution"]
}
```

# 7. Planner Adapter Router와 profile 호환성

## 7.1 v1 선택 우선순위

> **1.** plan command의 명시적 --planner가 있으면 우선한다. boulder-native는 local-only이며 추가 external approval이 필요하지 않다.
>
> **2.** 명시적 planner가 없으면 active profile의 plan lane adapter를 따른다.
>
> **3.** external adapter가 configured-unverified, unavailable, blocked 상태이면 자동 live call을 하지 않는다. packet-only 안내 또는 사용자 선택을 반환한다.
>
> **4.** boulder-native-preview profile은 plan lane을 boulder-native로 설정한다. programming-default는 그대로 둔다.
>
> **5.** 현재 profile v1의 fallback.plan은 단일 adapter만 표현하므로 multi-hop fallback은 구현하지 않는다.

## 7.2 Adapter 상태별 동작

| **Adapter 상태**                  | **명시적 선택**                   | **profile 기본 선택** | **Boulder 동작**                       |
|-----------------------------------|-----------------------------------|-----------------------|----------------------------------------|
| local boulder-native              | 허용                              | preview에서 허용      | 즉시 native plan flow                  |
| external available + approval     | 허용                              | 허용                  | sanitized/approved adapter flow        |
| external available, approval 없음 | packet-only                       | blocked               | 승인 요청; live call 금지              |
| configured-unverified             | dry packet 또는 다른 planner 선택 | suggest only          | doctor 근거와 recovery hint 제공       |
| missing                           | 실패 또는 native 선택 안내        | fallback 문자열 안내  | 자동 install/clone 금지                |
| custom packet producer            | valid packet 제출 시 허용         | project profile 가능  | planning-packet.v1 validator 통과 필요 |

## 7.3 Preview profile 제안

**필드는 현행 LaneRoute의 modelPreference/evidenceRequired를 포함해 실제 fixture에서 완전하게 작성**

```json
{
  "schemaVersion": "boulder.profile.resolved.v1",
  "id": "boulder-native-preview",
  "purpose": "programming",
  "surface": ["intake","plan","execute","verify","record"],
  "lanes": {
    "intake":  {"owner":"boulder","adapter":"boulder","mode":"local-only"},
    "plan":    {"owner":"boulder","adapter":"boulder-native","mode":"local-only"},
    "critic":  {"owner":"codex","adapter":"codex","mode":"local-only"},
    "handoff": {"owner":"boulder","adapter":"boulder","mode":"local-only"},
    "execute": {"owner":"external-adapter","adapter":"lazycodex","mode":"detect-and-suggest"},
    "verify":  {"owner":"boulder","adapter":"boulder","mode":"local-only"},
    "compound":{"owner":"boulder","adapter":"boulder","mode":"local-only"},
    "record":  {"owner":"boulder","adapter":"boulder","mode":"local-only"}
  },
  "fallback": {"plan":"codex","execute":"codex","critic":"codex","compound":"boulder"}
}
```

## 7.4 향후 profile v2가 필요한 조건

> **•** multi-hop fallback chain과 adapter별 availability predicate가 필수일 때
>
> **•** plan mode별 다른 adapter를 profile 자체에 선언해야 할 때
>
> **•** adapter selection receipts와 cost/latency policy가 profile contract에 들어갈 때
>
> **•** 이 경우 v1 object에 비공식 배열을 추가하지 않고 boulder.profile.resolved.v2 RFC를 별도 작성한다.

# 8. Versioned Data Contract

## 8.1 Artifact 목록

| **Schema**                  | **역할**                         | **작성 주체**         | **다음 gate**    |
|-----------------------------|----------------------------------|-----------------------|------------------|
| boulder.plan-analysis.v1    | deterministic routing evidence   | CLI                   | planner producer |
| boulder.planning-packet.v1  | decision-complete plan           | planner producer      | Critic           |
| boulder.critic-review.v1    | 독립 structural/semantic verdict | CLI + critic producer | plan approval    |
| boulder.plan-approval.v1    | 사용자 plan approval receipt     | CLI                   | execution packet |
| boulder.execution-packet.v1 | bounded executor contract        | CLI transformer       | execute/handoff  |

## 8.2 공통 envelope 규칙

| **필드**      | **규칙**                                                                                      |
|---------------|-----------------------------------------------------------------------------------------------|
| schemaVersion | 정확한 literal. unknown version은 fail closed.                                                |
| runId         | UUID 기본. 명시값은 ^\[A-Za-z0-9\]\[A-Za-z0-9.\_-\]{0,63}\$만 허용.                           |
| createdAt     | UTC ISO-8601. validation은 parse 가능 여부 확인.                                              |
| producer      | adapter, mode, host, toolVersion. 모델명은 optional metadata이며 라우팅 근거로 사용하지 않음. |
| packetDigest  | canonical JSON SHA-256. object key는 재귀 정렬, array 순서는 보존. digest 필드 자체는 제외.   |
| sourceRefs    | path, sha256, kind, trust, optional symbol/line hint. workspace 밖 path 금지.                 |
| status        | schema별 허용 literal만 사용. 자연어 status 금지.                                             |

## 8.3 PlanningPacket v1 필수 필드

| **영역**           | **필수 필드**                                                                   | **주요 불변식**                             |
|--------------------|---------------------------------------------------------------------------------|---------------------------------------------|
| identity           | schemaVersion, runId, createdAt, packetDigest, producer                         | digest는 canonical content와 일치           |
| task               | rawTaskHash, normalizedSummary, profileId, analysisRef                          | raw task는 packet에 중복 저장하지 않아도 됨 |
| objective          | single measurable objective                                                     | empty/compound vague objective 금지         |
| decisions          | id, statement, source, sourceRefs, confidence                                   | owner decision과 default를 구분             |
| scope              | allowedPaths, forbiddenPaths, protectedPaths, nonGoals                          | allowed와 protected overlap 금지            |
| tasks              | id, title, dependsOn, paths, steps, acceptanceIds, verificationIds, evidenceIds | dependency DAG, refs 존재                   |
| acceptanceCriteria | id, statement, verificationIds, evidenceIds                                     | 모든 AC가 verification+evidence에 연결      |
| verification       | id, kind, command/scenario, source, required, evidencePath                      | command source trust가 허용값               |
| risks              | id, severity, trigger, mitigation, rollback, approvalGate                       | high/critical은 mitigation/approval 필수    |
| approvalPolicy     | plan, execution, external                                                       | mutation task는 plan+execution required     |
| review             | structural, semantic, unresolvedFindings                                        | 최종 승인 전 pending 0                      |
| sourceRefs         | evidence reference set                                                          | required source drift 검증 가능             |

## 8.4 PlanningPacket v1 축약 예시

```json
{
  "schemaVersion":"boulder.planning-packet.v1",
  "runId":"5a9c8d44-...",
  "createdAt":"2026-07-14T12:00:00Z",
  "packetDigest":"sha256:...",
  "producer":{"adapter":"boulder-native","mode":"focused","host":"codex","toolVersion":"0.2.0"},
  "task":{"rawTaskHash":"sha256:...","normalizedSummary":"Add native planner packet validation","profileId":"boulder-native-preview","analysisRef":"analysis.json"},
  "objective":"Validate native planning packets and reject unsafe or untraceable plans.",
  "decisions":[
    {"id":"D1","statement":"Keep programming-default unchanged","source":"maintainer","sourceRefs":["S1"],"confidence":"high"}
  ],
  "scope":{"allowedPaths":["src/planning-packet.ts","test/planning-packet.test.ts","fixtures/planning-packets/**"],"forbiddenPaths":["src/handoff-packet.ts"],"protectedPaths":[".env*"],"nonGoals":["provider calls","default profile switch"]},
  "tasks":[
    {"id":"T1","title":"Implement shape validator","dependsOn":[],"paths":["src/planning-packet.ts"],"steps":["define type guard","return stable issues"],"acceptanceIds":["AC1"],"verificationIds":["V1"],"evidenceIds":["E1"]}
  ],
  "acceptanceCriteria":[
    {"id":"AC1","statement":"Unknown schema and unsafe scope fail closed","verificationIds":["V1"],"evidenceIds":["E1"]}
  ],
  "verification":[
    {"id":"V1","kind":"command","command":"bun test test/planning-packet.test.ts","source":"package-script","required":true,"evidencePath":"evidence/tests/planning-packet.txt"}
  ],
  "risks":[
    {"id":"R1","severity":"medium","trigger":"schema ambiguity","mitigation":"fixtures before implementation","rollback":"revert PR1","approvalGate":"plan"}
  ],
  "approvalPolicy":{"plan":"required","execution":"required","external":"required-if-used"},
  "review":{"structural":"pending","semantic":"pending","unresolvedFindings":[]},
  "sourceRefs":[{"id":"S1","path":"src/workflow-profile-builtins.ts","sha256":"sha256:...","kind":"code","trust":"repo-evidence"}]
}
```

## 8.5 CriticReview v1

| **필드**     | **값/규칙**                                                             |
|--------------|-------------------------------------------------------------------------|
| reviewType   | structural \| semantic                                                  |
| packetDigest | 검토한 planning packet canonical digest                                 |
| verdict      | PASS \| ITERATE \| REJECT                                               |
| findings     | id, severity, category, statement, evidenceRefs, requiredChange         |
| coverage     | scope, AC, verification, risk, approval, source grounding check id 배열 |
| reviewer     | adapter/host/toolVersion; planner producer와 독립 여부 표시             |
| createdAt    | UTC ISO-8601                                                            |

## 8.6 PlanApproval v1

| **필드**        | **규칙**                                                |
|-----------------|---------------------------------------------------------|
| schemaVersion   | boulder.plan-approval.v1                                |
| packetDigest    | 현재 reviewed planning packet digest와 일치             |
| reviewDigests   | structural PASS와 semantic PASS review digest 모두 포함 |
| nonce/signature | HMAC-SHA256, boulder.plan.approval.v1 domain separation |
| approvedAt      | UTC timestamp                                           |
| approvalScope   | plan-only. execution 권한을 포함하지 않음               |
| invalidatedBy   | packet/review/source drift가 발생하면 stale로 판정      |

## 8.7 ExecutionPacket v1 필수 필드와 단방향 매핑

| **Execution field**     | **Planning source**    | **불변식**                          |
|-------------------------|------------------------|-------------------------------------|
| planningPacketDigest    | packetDigest           | 정확히 일치                         |
| approvalReceiptDigest   | plan approval receipt  | valid and non-stale                 |
| objective               | objective              | 동일 또는 더 구체적; 의미 확대 금지 |
| allowedMutationPaths    | scope.allowedPaths     | subset only                         |
| forbiddenPaths/nonGoals | scope fields           | 삭제 또는 약화 금지                 |
| orderedTasks            | tasks + dependency DAG | topological order, task 추가 금지   |
| verificationCommands    | verification           | trusted source만 포함               |
| evidenceRequirements    | AC/evidence links      | 각 task completion에 필수           |
| riskControls/rollback   | risks                  | high/critical control 누락 금지     |
| executionApproval       | new gate               | plan approval과 별도 required       |

## 8.8 외부 HandoffPacket v1과의 분리

> **절대 혼합하지 않음**
>
> ExecutionPacket v1은 repo-local 상세 계약이며 sourceRef와 exact path를 포함할 수 있다. 기존 HandoffPacket v1은 raw workspace body, raw diff, secret, absolute path를 제외한 summary-only 외부 경계다. 외부 전송 시 ExecutionPacket 자체를 보내지 않고, 기존 handoff builder가 승인된 계획의 안전한 요약만 생성한다.

# 9. Planner Run State, Artifact Layout, Idempotency

## 9.1 Artifact layout

```text
.boulder/plans/<runId>/
  request.json
  analysis.json
  state.json
  draft.json
  planning-packet.json
  reviews/
    structural.json
    semantic-001.json
    semantic-002.json
  revisions/
    001.json
    002.json
  receipts/
    reviewed.yaml
    approved.yaml
  execution-packet.json
  events.jsonl
  lock
```

## 9.2 State machine

| **현재 상태**          | **허용 전이**                             | **필수 guard**                            |
|------------------------|-------------------------------------------|-------------------------------------------|
| created                | analyzed, stopped                         | request valid, safe run path              |
| analyzed               | awaiting-input, ready-to-draft, stopped   | analysis digest valid                     |
| awaiting-input         | analyzed, ready-to-draft, stopped         | question answer recorded; revision++      |
| ready-to-draft         | drafted, stopped                          | open owner decisions=0                    |
| drafted                | reviewing, stopped                        | planning packet schema valid              |
| reviewing              | revising, awaiting-plan-approval, stopped | structural+semantic digest join           |
| revising               | drafted, stopped                          | iteration \<= 3, prior findings addressed |
| awaiting-plan-approval | approved, revising, stopped               | reviews PASS and current digest           |
| approved               | execution-packet-ready, stopped           | approval receipt valid and source drift=0 |
| execution-packet-ready | handed-off, stopped                       | execution approval or safe handoff flow   |
| handed-off             | stopped                                   | terminal receipt/evidence recorded        |
| stopped                | none                                      | terminal                                  |

## 9.3 상태 불변식

> **•** stateRevision은 0부터 단조 증가한다. write는 expectedRevision이 일치할 때만 성공한다.
>
> **•** planning packet bytes가 바뀌면 packetDigest, review, review receipt, plan approval receipt, execution packet은 모두 stale이 된다.
>
> **•** semantic revision은 max 3이다. 초과 시 자동 승인하지 않고 plan.review.iteration_limit으로 maintainer decision을 요구한다.
>
> **•** state.json과 artifact는 atomic temp write + rename을 사용한다. lock은 O_EXCL로 생성하고 자동 stale break를 하지 않는다.
>
> **•** lock 충돌은 plan.state.locked로 실패한다. --force unlock은 별도 명령과 명시적 operator action이 필요하다.
>
> **•** sourceRefs의 required file digest가 달라지면 execution packet 생성 전 plan.repo_drift로 실패한다.
>
> **•** command 재실행은 이미 같은 digest의 artifact가 존재하면 no-op receipt를 반환해야 한다.

## 9.4 Repo drift 규칙

| **Drift**                        | **판정**                              | **복구**                                       |
|----------------------------------|---------------------------------------|------------------------------------------------|
| required sourceRef digest 변경   | block                                 | re-analyze 또는 sourceRefs 갱신 후 full review |
| optional sourceRef 변경          | warn                                  | semantic critic가 영향 여부 판정               |
| manifest/profile 변경            | block if policy/verification affected | analysis 재생성                                |
| format-only planning packet 변경 | canonical digest가 같으면 no drift    | receipt 유지                                   |
| execution 시작 후 drift          | executor가 scope/evidence와 함께 보고 | verify/review decision에서 처리                |

## 9.5 Recovery matrix

| **실패**              | **Error ID**                            | **복구 경로**                                      |
|-----------------------|-----------------------------------------|----------------------------------------------------|
| corrupt state.json    | plan.state.invalid                      | 원본 보존, last valid event에서 repair 또는 새 run |
| lock 존재             | plan.state.locked                       | writer 종료 확인 후 explicit unlock                |
| stale review/approval | plan.review.stale / plan.approval.stale | 현재 digest로 review/approval 재실행               |
| iteration cap         | plan.review.iteration_limit             | maintainer가 refine/accept-risk/stop 선택          |
| unsafe artifact path  | plan.path.invalid                       | safe run id/path로 재시작                          |
| adapter unavailable   | plan.adapter.unavailable                | native preview/custom packet/stop 중 선택          |
| repo drift            | plan.repo_drift                         | source refresh 후 review loop 재진입               |

# 10. CLI Contract와 출력 규약

## 10.1 제안 명령

| **명령**                                                        | **쓰기** | **설명**                                          |
|-----------------------------------------------------------------|----------|---------------------------------------------------|
| boulder plan analyze --task \<text\>                            | 없음     | deterministic analysis를 human/JSON으로 출력      |
| boulder plan start --task \<text\> \[--run-id \<id\>\]          | 있음     | .boulder/plans/\<runId\> scaffold와 state 생성    |
| boulder plan show \<runId\> --json                              | 없음     | 현재 state와 artifact digest 표시                 |
| boulder plan validate --packet \<path\>                         | 없음     | planning packet schema/invariant 검사             |
| boulder plan review --packet \<path\> --review \<path\>         | 있음     | digest join, reviewed receipt, approval code 생성 |
| boulder plan approve --packet \<path\> --approval-code \<code\> | 있음     | plan-only approval receipt 생성                   |
| boulder plan execution-packet --packet \<path\>                 | 있음     | approved plan을 execution packet으로 변환         |
| boulder plan unlock \<runId\> --force                           | 있음     | operator 확인 후 lock 제거; 기본 금지             |

## 10.2 명령별 정책

| **명령**         | **provider/external**                      | **product mutation**       | **승인**                    |
|------------------|--------------------------------------------|----------------------------|-----------------------------|
| analyze          | 금지                                       | 없음                       | 없음                        |
| start            | 금지                                       | planner artifact만         | 없음                        |
| validate/show    | 금지                                       | 없음                       | 없음                        |
| review           | semantic review artifact를 입력으로만 수용 | planner artifact/receipt만 | 없음                        |
| approve          | 금지                                       | approval receipt만         | 명시적 approval code        |
| execution-packet | 금지                                       | execution artifact만       | valid plan approval 필요    |
| handoff send     | 기존 정책                                  | 외부 launch 가능           | 기존 external approval 필요 |

## 10.3 Shared parser 변경점

> **•** src/cli.ts의 GLOBAL_VALUE_FLAGS에 --task, --planner, --mode, --run-id, --packet, --review, --approval-code를 추가해 command 앞 옵션을 안전하게 건너뛴다.
>
> **•** CliOptions.runId의 field-run 기본값을 planner run에 재사용하지 않는다. plan-command가 optionValue를 직접 읽고 없으면 crypto.randomUUID()를 생성한다.
>
> **•** missing value flag는 현재 valueAfter 규칙대로 null로 처리하며 다음 --flag를 값으로 삼지 않는다.
>
> **•** subcommand는 runProfileCommand/runHandoffCommand와 동일한 subcommandAfter 패턴을 따른다.

## 10.4 JSON 성공 출력

```json
{
  "schemaVersion": "boulder.plan.command-result.v1",
  "command": "plan analyze",
  "status": "ready",
  "runId": "5a9c8d44-...",
  "artifacts": [],
  "analysis": {"schemaVersion":"boulder.plan-analysis.v1", "selectedMode":"focused", "score":42},
  "nextActions": ["boulder plan start --run-id 5a9c8d44-... --task ..."]
}
```

## 10.5 오류 출력

```text
Human:
ERROR plan.scope.path_invalid: Allowed path must stay inside the workspace.

--json:
{
  "schemaVersion":"boulder.error.v1",
  "error":{
    "id":"plan.scope.path_invalid",
    "message":"Allowed path must stay inside the workspace.",
    "path":"scope.allowedPaths[2]",
    "recoveryHintId":"plan.use_safe_relative_path"
  }
}
```

v1은 기존 CLI 관례를 따라 모든 실패를 exit code 1로 유지한다. 세분화된 machine handling은 stable error.id로 수행하고, 새 exit code 체계는 별도 호환성 RFC 없이 도입하지 않는다.

# 11. Critic, Review Join Gate, Approval Algorithm

## 11.1 Structural Critic 체크

| **Check ID**       | **검사**                                                                 |
|--------------------|--------------------------------------------------------------------------|
| schema             | version, required field, literal, type                                   |
| identity           | runId, timestamps, canonical digest                                      |
| scope              | workspace containment, protected overlap, non-goal presence              |
| graph              | unique ids, existing refs, acyclic dependencies                          |
| traceability       | task -\> AC -\> verification -\> evidence 100%                           |
| verification-trust | manifest/package-script/user-approved source only for executable command |
| risk               | high/critical mitigation, rollback, approval gate                        |
| approval           | mutation plan has plan+execution required                                |
| source-grounding   | required sourceRefs exist and digest is valid                            |
| external-boundary  | raw workspace is not marked for external packet                          |

## 11.2 Semantic Critic rubric

| **영역**               | **질문**                                               | **REJECT 조건**                                    |
|------------------------|--------------------------------------------------------|----------------------------------------------------|
| Intent                 | objective와 owner decisions가 사용자 의도와 일치하는가 | explicit user decision과 충돌                      |
| Scope                  | 필요한 범위를 빠뜨리거나 확장했는가                    | critical sub-scope 누락 또는 unrequested expansion |
| Architecture           | 기존 패턴을 존중하고 대안/트레이드오프가 합리적인가    | 기존 contract를 불필요하게 깨뜨림                  |
| Execution completeness | executor에게 남은 판단이 0인가                         | 경로/순서/AC/QA 중 핵심 판단 누락                  |
| Verification           | happy/failure/edge와 evidence가 충분한가               | 성공을 검증할 방법 없음                            |
| Safety                 | hard override와 approval/rollback이 반영됐는가         | 보안/파괴적 위험 미처리                            |

## 11.3 Review join gate

```text
join PASS when all are true:
  structural.verdict == PASS
  semantic.verdict == PASS
  structural.packetDigest == planning.packetDigest
  semantic.packetDigest == planning.packetDigest
  unresolved HIGH/CRITICAL findings == 0
  review iteration <= 3
  source drift == 0

otherwise:
  ITERATE -> planner revision -> both reviews rerun
  REJECT  -> stop or explicit maintainer scope decision
  stale   -> discard receipt and rerun review
```

## 11.4 Receipt 설계

> **•** 기존 boulder.handoff.review.v1의 schema, digest 방식, receipt path, approval code 동작은 변경하지 않는다.
>
> **•** 새 boulder.plan.review.v1과 boulder.plan.approval.v1은 같은 review-secret을 사용할 수 있지만 HMAC message에 schema/purpose를 포함해 domain separation한다.
>
> **•** receipt는 packetDigest와 reviewDigest에 결합한다. packet 또는 review가 바뀌면 검증에 실패한다.
>
> **•** approval code는 plan approval을 증명할 뿐 execution approval 또는 external approval을 대체하지 않는다.
>
> **•** crypto helper를 공통화할 경우 기존 handoff golden fixture가 byte-for-byte 동일함을 먼저 증명한다.

## 11.5 Revision 정책

| **회차** | **행동**                                                     | **결과**                                                 |
|----------|--------------------------------------------------------------|----------------------------------------------------------|
| 0        | initial packet + independent reviews                         | PASS 또는 findings                                       |
| 1-3      | consolidated findings로 planner revision; 모든 review 재실행 | 같은 digest join gate 적용                               |
| \>3      | 자동 revision 중단                                           | maintainer: refine scope / accept documented risk / stop |

# 12. Security, Trust, Failure Model

## 12.1 위협 모델

| **위협**            | **공격/실패 방식**                                    | **완화**                                                                      |
|---------------------|-------------------------------------------------------|-------------------------------------------------------------------------------|
| Path escape         | ../, absolute path, symlink, hardlink, directory swap | .boulder/plans containment, lstat/no-follow, pre/post check, atomic rename    |
| Packet tampering    | review 후 plan content 수정                           | canonical digest + HMAC receipt + stale invalidation                          |
| Receipt replay      | 다른 packet/run에 approval code 재사용                | runId, packetDigest, reviewDigest, nonce, purpose binding                     |
| Prompt injection    | repo README/code가 “명령 실행/secret 전송” 지시       | source trust labels; repo evidence는 instruction이 아님; CLI side-effect 금지 |
| Command injection   | planner가 arbitrary shell verification 제안           | trusted command source enum; plan 단계 실행 금지; executor approval           |
| Secret exfiltration | external adapter packet에 env/raw file 포함           | 기존 summary-only redaction, protected path, explicit external approval       |
| Dependency abuse    | planner가 install/update를 완료 조건으로 넣음         | new dependency hard override; install은 execute approval 밖에서 금지          |
| Concurrent writers  | 두 agent가 state/receipt를 덮어씀                     | O_EXCL lock, stateRevision, atomic replace                                    |
| DoS by interview    | 무한 질문/반복                                        | focused \<=3, deep repeated-question guard, closure/stop option               |

## 12.2 Source trust 분류

| **trust**          | **예시**                           | **허용 사용**                                          |
|--------------------|------------------------------------|--------------------------------------------------------|
| operator-contract  | user decision, BOULDER.md policy   | scope/approval의 최상위 근거                           |
| repo-instruction   | AGENTS.md, maintainer rules        | 코드 작성 규칙. user approval을 대신하지 않음          |
| repo-evidence      | source, test, README, package.json | fact/architecture evidence. 내부 지시 실행 금지        |
| official-external  | 공식 library/product docs          | API/contract evidence                                  |
| untrusted-external | issue/comment/비공식 글            | 보조 정보만; owner decision/보안 근거로 단독 사용 금지 |

## 12.3 Verification command trust

| **source**       | **Execution packet 포함** | **조건**                                              |
|------------------|---------------------------|-------------------------------------------------------|
| manifest         | 허용                      | boulder.yaml verification에서 그대로 유래             |
| package-script   | 허용                      | package.json script name을 고정된 runner 형태로 변환  |
| user-approved    | 허용                      | plan approval에서 명시적으로 확인                     |
| planner-proposed | 기본 차단                 | user-approved로 승격되기 전 data only                 |
| repo-text        | 차단                      | README/code block에서 발견한 command는 자동 신뢰 금지 |

## 12.4 Fail-closed 원칙

> **•** unknown schema, unknown status, unknown command trust source는 모두 거부한다.
>
> **•** missing review, stale digest, source drift, protected overlap은 warning이 아니라 block이다.
>
> **•** semantic critic unavailable일 때 high/deep plan은 승인할 수 없다. direct/focused도 정책상 semantic review required이면 block한다.
>
> **•** external adapter가 unavailable/configured-unverified이면 live call을 시도하지 않는다.
>
> **•** 자동 repair가 source of truth를 추측해야 하는 경우 repair하지 않고 원본을 보존한다.

# 13. 구현 구조와 PR 분해

## 13.1 신규 파일

| **파일**                           | **책임**                                         | **주요 테스트**         |
|------------------------------------|--------------------------------------------------|-------------------------|
| src/plan-command.ts                | plan subcommand dispatcher, output/error mapping | plan-cli-e2e            |
| src/plan-analysis.ts               | dimension scoring, override, mode decision       | plan-analysis           |
| src/plan-analysis-shape.ts         | analysis type guard/formatter                    | plan-analysis-shape     |
| src/planner-router.ts              | explicit/profile/status selection                | planner-router          |
| src/plan-store.ts                  | safe run paths, atomic artifact I/O, lock        | plan-store-security     |
| src/plan-state.ts                  | transition guard, revision, stale handling       | plan-state              |
| src/planning-packet.ts             | type, canonical digest, validator                | planning-packet         |
| src/critic-review.ts               | review shape, join gate, iteration               | critic-review           |
| src/plan-receipts.ts               | review/approval receipt and HMAC domain          | plan-receipts           |
| src/execution-packet.ts            | one-way transform and scope subset checks        | execution-packet        |
| src/planner-benchmark.ts           | rubric evaluation and report                     | planner-benchmark       |
| skills/boulder-native-planner/\*\* | direct/focused/deep planner and critic prompts   | skill fixture/manual QA |

## 13.2 수정 파일

| **파일**                         | **변경**                             | **호환성 guard**                    |
|----------------------------------|--------------------------------------|-------------------------------------|
| src/cli.ts                       | plan command route, global flags     | 기존 command/global-option e2e      |
| src/cli-options.ts               | 필요 시 shared flag parsing만 확장   | field-run default 의미 불변         |
| src/cli-format.ts                | help에 plan surface 추가             | 기존 help smoke 유지                |
| src/workflow-profile-builtins.ts | boulder-native-preview built-in 추가 | programming-default byte-equivalent |
| src/capability-doctor.ts         | boulder-native local capability 표시 | GJC/Lazy status 불변                |
| src/run-event-shape.ts           | terminal plan event name만 추가      | v1 record shape 불변                |
| src/handoff-paths.ts             | 공통 crypto 추출 시 wrapper만 유지   | golden receipt byte match           |
| README/CHANGELOG/docs            | preview usage, boundaries, migration | five-verb surface 유지              |

## 13.3 8개 PR 시퀀스

| **PR**                       | **범위**                                           | **Merge gate**                                  | **독립 rollback**       |
|------------------------------|----------------------------------------------------|-------------------------------------------------|-------------------------|
| PR1 Contract Freeze          | schemas, type guards, canonical JSON, fixtures     | valid/invalid fixture 100%, no CLI change       | 파일 삭제로 완전 revert |
| PR2 Safe Store/State         | plan-store, state, lock, drift, receipts primitive | negative path/concurrency tests                 | planner feature 미노출  |
| PR3 Analyzer/Router          | score, overrides, explicit planner selection       | determinism 100 runs, router matrix             | analysis command 미연결 |
| PR4 CLI Read-only            | analyze/show/validate + help/error JSON            | global option regression, no writes for analyze | command route revert    |
| PR5 Native Skill/Critic      | skill, scaffold, review loop, plan approval        | 3 fixture plans PASS, iteration/stale tests     | preview only            |
| PR6 Execution Packet         | one-way transform, execution approval contract     | scope subset and traceability 100%              | handoff untouched       |
| PR7 Preview Integration      | profile, doctor, quickstart docs                   | programming-default unchanged                   | remove preview profile  |
| PR8 Benchmark/Field Evidence | planner benchmark, metrics, promotion report       | promotion thresholds computed, claims bounded   | default unchanged       |

## 13.4 Phase exit gates

| **Phase**          | **Exit gate**                                                                      |
|--------------------|------------------------------------------------------------------------------------|
| Contract           | required field/error id/schema fixtures maintainer-approved                        |
| State              | unsafe paths 0 accepted, stale receipts 0 accepted, illegal transitions 0 accepted |
| Analyzer           | deterministic output, hard override coverage, direct/focused/deep fixtures pass    |
| Critic             | digest join, max 3 revisions, plan approval separate from execution                |
| Execution contract | scope/evidence/approval mapping 100%, external handoff unchanged                   |
| Preview            | GJC preferred unchanged, boulder-native explicit only, doctor status clear         |
| Field evidence     | promotion rubric threshold met or HOLD maintained                                  |

# 14. 테스트 전략과 구체적 QA

## 14.1 테스트 스위트

| **테스트 파일**                  | **필수 케이스**                                                                                           |
|----------------------------------|-----------------------------------------------------------------------------------------------------------|
| test/plan-analysis.test.ts       | dimension level, score, thresholds, boundary upgrade, every hard override, normalized task determinism    |
| test/planner-router.test.ts      | explicit native, external available/blocked/unverified/missing, preview profile, no multi-hop             |
| test/planning-packet.test.ts     | all required fields, duplicate/missing refs, DAG cycle, protected overlap, traceability, command trust    |
| test/plan-store-security.test.ts | outside path, absolute, .., symlink root/dir/file, hardlink, swap, atomic replace, lock conflict          |
| test/plan-state.test.ts          | all valid/invalid transitions, expectedRevision mismatch, idempotent replay, max iteration, corrupt state |
| test/critic-review.test.ts       | digest join, PASS/ITERATE/REJECT, stale review, unresolved high finding, independent reviewer metadata    |
| test/plan-receipts.test.ts       | nonce, signature, wrong code, other run replay, packet change, review change, domain separation           |
| test/execution-packet.test.ts    | scope subset, task order, AC mapping, command trust, rollback, approval preservation                      |
| test/plan-cli-e2e.test.ts        | options before/after command, missing values, JSON/human, write/no-write, exit 1, resume/show/unlock      |
| test/planner-benchmark.test.ts   | rubric arithmetic, critical fail cap, promotion threshold, bounded claims                                 |
| test/cli-e2e.test.ts (existing)  | init/profile/handoff/doctor/export/pipeline/run events unchanged                                          |

## 14.2 Property 및 negative tests

| **범주**             | **Property**                                                                |
|----------------------|-----------------------------------------------------------------------------|
| Canonical digest     | key order/whitespace가 달라도 같은 digest, array order가 바뀌면 다른 digest |
| Scope monotonicity   | 임의 execution allowedPaths는 planning allowedPaths의 subset일 때만 valid   |
| Reference integrity  | 임의 id mutation 시 validator가 정확한 path error 반환                      |
| State monotonicity   | stateRevision 감소/건너뛰기/terminal 탈출 불가                              |
| Receipt binding      | packet/review/run/purpose 중 하나라도 바뀌면 invalid                        |
| Path containment     | random relative path가 base 밖으로 normalize되면 항상 invalid               |
| Analyzer determinism | 동일 fixture 100회 결과 canonical bytes 동일                                |

## 14.3 정적 side-effect gate

```bash
rg -n "child_process|Bun.spawn|spawn\(|exec\(|curl |npm install|bun add|credential|provider-call|external-launch"   src/plan-*.ts src/planning-packet.ts src/critic-review.ts src/execution-packet.ts   skills/boulder-native-planner test/plan-*.test.ts

Expected:
- analyzer/store/validator/critic/packet code has no process launch or provider client
- command strings appear only as data fixtures or explicit policy assertions
- external execution remains in existing approval-gated handoff surface
```

## 14.4 전체 CI 및 패키지 gate

> **•** \`bun test\` passes, including all existing suites.
>
> **•** \`bun run build\` passes with TypeScript 6.
>
> **•** \`bun pm pack --dry-run --ignore-scripts\` includes new skill and fixtures, and excludes duplicate copy artifacts.
>
> **•** \`boulder --help\`, \`plan analyze\`, invalid mode/path/schema, preview profile resolve를 manual smoke한다.
>
> **•** 기존 pipeline low/medium/high human/JSON output snapshot이 Phase 1-6에서 불변인지 확인한다.

## 14.5 End-to-end acceptance scenarios

| **Scenario**      | **입력**                                    | **기대**                                                       |
|-------------------|---------------------------------------------|----------------------------------------------------------------|
| A small bug       | known path/symbol/test                      | direct, 질문 0, plan approval required, exact one-module scope |
| B medium feature  | multiple files, one owner fork              | focused, 질문 \<=3, AC/QA/evidence 100%                        |
| C security change | auth/PII signal                             | deep hard override, security review, negative tests, rollback  |
| D GJC unavailable | programming-default + configured-unverified | no live call, native preview/codex/stop 선택                   |
| E tampered plan   | review 후 field edit                        | old review/approval stale, execution packet blocked            |
| F unsafe path     | allowedPaths includes ../secret             | stable error, artifact/receipt 없음                            |
| G repo drift      | sourceRef digest changes after approval     | execution packet blocked, re-review required                   |

# 15. Planner Benchmark, Promotion Gate, Evidence

## 15.1 기존 benchmark와 분리

> **별도 command 필요**
>
> 현재 boulder benchmark는 harness fixture contract와 claim discipline을 검사하며 model quality comparison을 명시적으로 금지한다. Native Planner 평가는 이를 변경하지 않고 boulder planner-benchmark 또는 boulder plan benchmark라는 별도 schema/command로 구현한다.

## 15.2 100점 rubric

| **항목**                     | **가중치** | **측정**                                                    |
|------------------------------|------------|-------------------------------------------------------------|
| Scope correctness            | 20         | 필요 범위 포함, unrequested 범위 없음, exact path 정확도    |
| Decision completeness        | 20         | executor judgment count, owner decisions, defaults의 명시성 |
| AC-verification traceability | 15         | AC -\> verification -\> evidence 연결률                     |
| Safety/approval discipline   | 15         | hard override, rollback, plan/execute/external 승인 분리    |
| Evidence grounding           | 10         | repo fact sourceRef 정확도, unsupported assumption 수       |
| Question efficiency          | 10         | 질문 수, owner decision yield, 중복 질문                    |
| Execution usability          | 10         | task ordering, dependency, QA, commit/rollback boundary     |

## 15.3 Critical fail cap

> **•** protected path 또는 external raw workspace 위반: 전체 score 최대 49, rating=blocked
>
> **•** plan approval과 execution approval 혼동: 전체 score 최대 59
>
> **•** hard override 누락: 해당 case rating=blocked
>
> **•** AC traceability 100% 미만: promotion 대상에서 제외
>
> **•** 근거 없는 우월성/속도/leaderboard claim: benchmark report fail

## 15.4 Field study 설계

| **축**           | **최소 표본**                                                                            |
|------------------|------------------------------------------------------------------------------------------|
| Planner          | GJC, Boulder Native, LazyCodex ulw-plan                                                  |
| Task class       | small bug, medium feature, high-risk change                                              |
| Repository shape | small TS CLI, medium multi-module repo                                                   |
| Repeat           | planner/task/repo 조합당 2회                                                             |
| 총 최소 run      | 3 planners x 3 tasks x 2 repos x 2 repeats = 36                                          |
| Evaluator        | 공통 packet normalizer + blinded human review + deterministic validator                  |
| Evidence         | input task, sourceRefs, questions, packet, reviews, execution delta, verification result |

## 15.5 Promotion threshold

| **승격**            | **조건**                                                                                              |
|---------------------|-------------------------------------------------------------------------------------------------------|
| Preview 유지        | critical fail 0, average \>= 85, but sample/variance insufficient                                     |
| First fallback 검토 | 모든 case \>= 88, weighted average \>= 92, traceability 100%, critical fail 0, repeat variance \<= 5  |
| Preferred 검토      | 두 release cycle과 외부 maintainer evidence, average \>= 94, no regression in safety/UX, separate RFC |
| 자동 보류           | 어느 한 high-risk case라도 hard override/approval/rollback fail                                       |

## 15.6 계산 예시

```text
plannerScore = sum(criterionPoints)  # max 100
weightedAverage = sum(caseScore * caseWeight) / sum(caseWeight)
caseWeight: small=1, medium=1.5, high-risk=2

Promotion requires BOTH:
  weightedAverage >= threshold
  every safety gate == PASS

A high average cannot compensate for a critical safety failure.
```

# 16. 출시, 마이그레이션, 롤백, 관측성

## 16.1 출시 단계

| **단계**                   | **활성화**                                | **기본 상태**                 | **Exit**                                  |
|----------------------------|-------------------------------------------|-------------------------------|-------------------------------------------|
| 0 Contract only            | 없음                                      | 사용자 노출 없음              | schemas/tests approved                    |
| 1 Read-only CLI            | plan analyze/validate                     | opt-in command                | determinism/security pass                 |
| 2 Native preview           | --planner boulder-native, preview profile | programming-default unchanged | fixture + internal field runs             |
| 3 First fallback candidate | 별도 profile/RFC                          | still not preferred           | 36-run threshold + release-cycle evidence |
| 4 Preferred candidate      | separate semver/RFC                       | maintainer explicit decision  | external maintainer repeatability         |

## 16.2 마이그레이션 정책

> **•** 모든 new artifact는 v1 literal로 시작한다. unknown version은 fail closed한다.
>
> **•** 기존 boulder.yaml.executors와 profile v1은 그대로 읽는다.
>
> **•** 기존 .boulder/handoffs/\*\* 및 review receipt는 이동/변환하지 않는다.
>
> **•** preview artifact schema 변경이 필요하면 migration command 또는 명시적 regenerate를 제공하고 silent rewrite하지 않는다.
>
> **•** default 전환은 semver minor 이상, CHANGELOG, migration note, benchmark evidence, rollback command를 동반한다.

## 16.3 Rollback

| **문제**               | **Rollback**                                              |
|------------------------|-----------------------------------------------------------|
| preview profile 문제   | profile use programming-default 또는 current-profile 제거 |
| native skill 문제      | explicit planner override 중단; GJC/Codex path 유지       |
| state schema 문제      | artifact 보존 후 새 run; 기존 product files 영향 없음     |
| execution packet issue | execution gate에서 block; 기존 handoff path 사용 가능     |
| receipt regression     | PR2/PR5 revert; 기존 handoff golden test로 안전 확인      |

## 16.4 관측성

| **저장 위치**                         | **내용**                                                      | **Privacy**                          |
|---------------------------------------|---------------------------------------------------------------|--------------------------------------|
| .boulder/plans/\<runId\>/events.jsonl | state transition, error id, digest, duration                  | raw task/body 없음                   |
| .boulder/plans/\<runId\>/metrics.json | question count, critic iterations, traceability, source drift | aggregate only                       |
| .boulder/runs/\*.json                 | terminal plan-analyze/approve/packet event                    | cwd hash, artifact path, no raw task |
| field evidence packet                 | benchmark normalized data와 maintainer outcome                | share-safe review 후 사용            |

## 16.5 RunEvent v1 확장 범위

> **•** shape는 변경하지 않고 RunEventName union에 plan analyze, plan approve, plan execution packet 같은 terminal event만 추가한다.
>
> **•** drafting/question/revision 세부 상태는 plan state/events에 남기고 global runs list를 오염시키지 않는다.
>
> **•** artifactPaths는 workspace-relative safe path만 기록하며 task text와 source file body를 기록하지 않는다.

# 17. 요구사항 추적성 매트릭스

| **ID** | **요구사항**                | **구현**                              | **검증**                      |
|--------|-----------------------------|---------------------------------------|-------------------------------|
| R1     | 기존 lane 유지              | workflow-profile v1 재사용            | profile regression            |
| R2     | GJC preferred 유지          | programming-default 불변              | built-in snapshot             |
| R3     | 명확한 small task 질문 0    | plan-analysis direct                  | small bug e2e                 |
| R4     | owner decision만 질문       | native skill focused                  | question yield benchmark      |
| R5     | high-risk hard override     | plan-analysis rules                   | all override fixtures         |
| R6     | planner-neutral contract    | planning-packet v1                    | GJC/native/custom fixtures    |
| R7     | Critic 독립                 | critic-review v1                      | reviewer metadata/digest join |
| R8     | plan approval != execution  | plan approval/execution packet fields | approval e2e                  |
| R9     | scope 확대 금지             | execution transform subset            | property tests                |
| R10    | external raw workspace 금지 | existing handoff v1                   | handoff regression            |
| R11    | unsafe path 금지            | plan-store safe access                | security negatives            |
| R12    | receipt tamper/replay 금지  | HMAC/digest/purpose                   | receipt negatives             |
| R13    | source drift 차단           | sourceRef digest                      | repo drift e2e                |
| R14    | deterministic analyzer      | canonical output                      | 100-repeat test               |
| R15    | revision 무한 loop 금지     | max iteration 3                       | state/critic test             |
| R16    | provider call 없음          | CLI responsibility boundary           | static scan                   |
| R17    | profile v1 호환             | preview only, no fallback chain       | project profile load tests    |
| R18    | 기존 CLI 옵션 위치 호환     | GLOBAL_VALUE_FLAGS update             | cli e2e                       |
| R19    | benchmark claim discipline  | separate benchmark schema             | report test                   |
| R20    | default 전환 evidence gate  | promotion threshold                   | field readiness report        |

# 18. 최종 자체 평가와 개발 승인

## 18.1 가중 평가

| **평가 항목**          | **가중치** | **점수** | **근거**                                               |
|------------------------|------------|----------|--------------------------------------------------------|
| 기존 코드베이스 적합성 | 15%        | 99       | 현행 lane/profile/CLI/store/receipt 패턴에 정확히 맞춤 |
| 계약 구체성            | 15%        | 99       | 5개 schema, digest, field, invariant, error를 고정     |
| 안전 및 통제           | 15%        | 99       | path, HMAC, drift, trust, command, external 경계       |
| 구현 분해              | 15%        | 98       | 8개 독립 PR과 file/test/rollback gate                  |
| 테스트 가능성          | 15%        | 99       | named suites, property/negative/e2e/static gate        |
| 하위 호환성            | 10%        | 98       | GJC/default/profile v1/handoff v1/exit code 보존       |
| 사용자 경험/라우팅     | 8%         | 96       | direct=0 questions, focused cap; calibration residual  |
| 벤치마크/롤아웃        | 7%         | 97       | 별도 rubric, 36-run 설계, promotion/rollback           |
| 가중 합계              | 100%       | 98.4     | Implementation readiness                               |

## 18.2 잔여 위험

| **잔여 위험**             | **현재 처리**                                      | **왜 100점이 아닌가**                           |
|---------------------------|----------------------------------------------------|-------------------------------------------------|
| Semantic planner quality  | 공통 packet/critic/benchmark로 통제                | 실제 비교 run 전 품질 분포를 알 수 없음         |
| Routing calibration       | deterministic score+hard override+boundary upgrade | 도메인별 false positive/negative 실측 필요      |
| Host skill portability    | planner-neutral contract와 CLI 분리                | Codex 외 host integration field test 필요       |
| Concurrent agent behavior | single-writer lock/revision 설계                   | 다양한 filesystem/platform stress evidence 필요 |

## 18.3 최종 판정

> **98.4 / 100 - IMPLEMENTATION GO**
>
> PR1 Contract Freeze부터 개발을 시작해도 된다. PR1-PR6은 승인 범위이며, PR7 preview integration은 기존 programming-default가 byte-equivalent임을 증명한 뒤 merge한다. Native Planner를 preferred 또는 first fallback으로 승격하는 작업은 PR8 field evidence 이후에도 별도 maintainer 승인 없이는 진행하지 않는다.

## 18.4 첫 이터레이션 Definition of Done

> **•** boulder.plan-analysis.v1과 boulder.planning-packet.v1 valid/invalid fixture가 존재한다.
>
> **•** canonical digest와 stable error id validator가 구현된다.
>
> **•** boulder plan analyze --task ... --json이 무변경, provider 0, deterministic output을 낸다.
>
> **•** unsafe path/protected overlap/untraceable AC/unknown schema가 모두 fail closed한다.
>
> **•** 기존 bun test, build, pack dry-run, CLI e2e가 통과한다.
>
> **•** programming-default, boulder.handoff.v1, existing receipt output이 변경되지 않는다.

# 부록 A. Stable Error ID 카탈로그

| **Error ID**                        | **조건**                               | **기본 복구**                         |
|-------------------------------------|----------------------------------------|---------------------------------------|
| plan.task.required                  | task missing/empty                     | --task 또는 task file 제공            |
| plan.mode.invalid                   | unknown direct/focused/deep            | 허용 mode 사용                        |
| plan.adapter.invalid                | unsafe adapter name                    | safe adapter id 사용                  |
| plan.adapter.unavailable            | selected adapter missing/blocked       | native preview/custom/stop 선택       |
| plan.run_id.invalid                 | unsafe or too long run id              | UUID 또는 safe slug 사용              |
| plan.path.invalid                   | artifact path outside/symlink/hardlink | safe .boulder/plans path 사용         |
| plan.state.missing                  | run state absent                       | plan start 또는 valid run id          |
| plan.state.invalid                  | state corrupt/shape invalid            | repair/new run                        |
| plan.state.locked                   | writer lock exists                     | writer 확인 후 explicit unlock        |
| plan.state.conflict                 | expectedRevision mismatch              | state refresh 후 retry                |
| plan.state.transition_invalid       | illegal state transition               | allowed next action 사용              |
| plan.schema.unsupported             | unknown schemaVersion                  | supported v1로 regenerate/migrate     |
| plan.packet.invalid                 | generic packet shape failure           | reported path 수정                    |
| plan.objective.missing              | objective empty                        | measurable objective 추가             |
| plan.scope.path_invalid             | unsafe allowed/forbidden path          | workspace-relative safe path          |
| plan.scope.protected_conflict       | allowed overlaps protected             | scope 수정; approval로 우회 불가      |
| plan.graph.cycle                    | task dependency cycle                  | DAG로 수정                            |
| plan.reference.missing              | id reference not found                 | referenced artifact 추가/수정         |
| plan.acceptance.untraceable         | AC lacks verification/evidence         | trace links 추가                      |
| plan.verification.command_untrusted | command source not trusted             | manifest/package/user approval로 승격 |
| plan.risk.override_unhandled        | hard override not reflected            | mode/approval/risk 수정               |
| plan.review.required                | missing PASS reviews                   | structural+semantic review 실행       |
| plan.review.stale                   | review digest mismatch                 | current packet 재검토                 |
| plan.review.iteration_limit         | revision \> 3                          | maintainer decision                   |
| plan.approval.required              | plan approval absent                   | review 후 explicit approve            |
| plan.approval.stale                 | approval digest mismatch               | current plan 재승인                   |
| plan.repo_drift                     | required source changed                | refresh/re-review                     |
| execution.scope.expanded            | execution exceeds plan scope           | transform 수정/plan revision          |
| execution.approval.required         | execution approval absent              | 별도 execution approval               |
| external.raw_workspace_forbidden    | external packet contains raw reference | summary/redaction 경계 사용           |

# 부록 B. Host Skill Contract 초안

## B.1 파일 구조

```text
skills/boulder-native-planner/
  SKILL.md
  references/
    direct.md
    focused.md
    deep.md
    packet-template.md
    critic.md
    trust-policy.md
  scripts/
    boulder-local.sh  # existing wrapper reuse or thin adapter
```

## B.2 Skill 불변 지침

> **•** 먼저 boulder plan analyze를 실행하고 selectedMode를 따른다. 사용자의 명시적 higher-friction 요청은 유지한다.
>
> **•** repo에서 읽을 수 있는 사실은 질문하지 않고 sourceRef로 기록한다.
>
> **•** direct는 질문 0개, focused는 최대 3개 owner decision, deep는 weakest open dimension을 한 번에 하나 질문한다.
>
> **•** plan artifact 외 product file을 쓰지 않는다. shell/provider/install/external launch를 계획 단계에서 실행하지 않는다.
>
> **•** planning packet은 validator를 통과하기 전 사용자에게 승인 가능한 최종 계획으로 제시하지 않는다.
>
> **•** semantic critic는 planner와 독립된 pass로 실행하고 packet digest를 포함한다.
>
> **•** plan approval은 execution 시작이 아님을 사용자에게 명시한다.

## B.3 Planner output checklist

| **Checklist**                                         | **필수** |
|-------------------------------------------------------|----------|
| Objective is singular and measurable                  | YES      |
| Every repo fact has sourceRef                         | YES      |
| Every default is recorded as decision source=default  | YES      |
| Allowed paths and non-goals are explicit              | YES      |
| Task dependency graph is acyclic                      | YES      |
| Every task maps to AC, verification, evidence         | YES      |
| High/critical risk has mitigation, rollback, approval | YES      |
| Executor judgment count is zero                       | YES      |
| No product mutation or provider call occurred         | YES      |

# 부록 C. 공식 출처

아래 자료는 각 프로젝트의 공식 GitHub 저장소에 공개된 README, 코드, 문서, skill 정의다. 본문 \[B#\], \[G#\], \[L#\]는 이 목록을 가리킨다.

| ID | 공식 자료 | 사용 근거 / blob SHA |
| --- | --- | --- |
| [B1] | Boulder README<br>https://github.com/min9lin9/boulder/blob/main/README.md | package 0.1.16, profile defaults, CLI and safety surface<br>e7136397... |
| [B2] | Boulder Workflow Architecture<br>https://github.com/min9lin9/boulder/blob/main/docs/WORKFLOW_ARCHITECTURE.md | four domains, lanes, five verbs, adapter contracts<br>fb8bd856... |
| [B3] | src/types.ts<br>https://github.com/min9lin9/boulder/blob/main/src/types.ts | ResolvedWorkflowProfile lanes, external policy, fallback shape<br>408c3fef... |
| [B4] | src/pipeline.ts<br>https://github.com/min9lin9/boulder/blob/main/src/pipeline.ts | friction stages, approval gates, forbidden side effects<br>0bd58a7a... |
| [B5] | src/workflow-profile-builtins.ts<br>https://github.com/min9lin9/boulder/blob/main/src/workflow-profile-builtins.ts | GJC/LazyCodex defaults and local lane ownership<br>3fd59b1e... |
| [B6] | src/handoff-packet.ts<br>https://github.com/min9lin9/boulder/blob/main/src/handoff-packet.ts | summary-only external packet, redaction, approval<br>52778edf... |
| [B7] | src/fs.ts<br>https://github.com/min9lin9/boulder/blob/main/src/fs.ts | safe generated writes, no-follow, symlink/hardlink checks<br>d80ca93c... |
| [B8] | src/handoff-paths.ts<br>https://github.com/min9lin9/boulder/blob/main/src/handoff-paths.ts | HMAC review receipt, approval code, safe packet I/O<br>b78a4341... |
| [B9] | src/cli-options.ts<br>https://github.com/min9lin9/boulder/blob/main/src/cli-options.ts | shared options and valueAfter behavior<br>7d555dfb... |
| [B10] | src/cli.ts<br>https://github.com/min9lin9/boulder/blob/main/src/cli.ts | command dispatcher and global flag sets<br>ed01c528... |
| [B11] | src/profile-command.ts<br>https://github.com/min9lin9/boulder/blob/main/src/profile-command.ts | subcommand/error/output conventions<br>e785e610... |
| [B12] | src/profile-store.ts<br>https://github.com/min9lin9/boulder/blob/main/src/profile-store.ts | profile v1 validator, fallback string, safe names/paths<br>f59dbad1... |
| [B13] | src/run-events.ts / run-event-shape.ts<br>https://github.com/min9lin9/boulder/blob/main/src/run-events.ts | safe local run event storage and v1 record shape<br>02cf9549... |
| [B14] | src/benchmark.ts<br>https://github.com/min9lin9/boulder/blob/main/src/benchmark.ts | current harness benchmark and disallowed model claims<br>eb25d1b4... |
| [B15] | skills/boulder/SKILL.md<br>https://github.com/min9lin9/boulder/blob/main/skills/boulder/SKILL.md | local skill, five verbs, explicit external approval<br>475a6291... |
| [G1] | Gajae Code README<br>https://github.com/Yeachan-Heo/gajae-code/blob/main/README.md | deep-interview -> ralplan -> ultragoal, roles<br>77e2fe5c... |
| [G2] | Gajae deep-interview skill<br>https://github.com/Yeachan-Heo/gajae-code/blob/main/packages/coding-agent/src/defaults/gjc/skills/deep-interview/SKILL.md | suitability gate, evidence-before-question, approval<br>2701a3de... |
| [G3] | Gajae ralplan skill<br>https://github.com/Yeachan-Heo/gajae-code/blob/main/packages/coding-agent/src/defaults/gjc/skills/ralplan/SKILL.md | Planner/Architect/Critic join and approval boundary<br>778fb39f... |
| [L1] | LazyCodex README<br>https://github.com/code-yeongyu/lazycodex/blob/main/README.md | ulw-plan, start-work, verified completion<br>2747f7a4... |
| [L2] | LazyCodex ulw-plan skill<br>https://github.com/code-yeongyu/lazycodex/blob/main/plugins/omo/skills/ulw-plan/SKILL.md | explore-first, decision-complete, durable draft<br>fd17face... |

> **출처 해석 주의**
>
> 이 문서는 공개 코드와 문서를 바탕으로 한 구현 설계다. 실제 GJC, Boulder Native, LazyCodex의 상대적 계획 품질은 동일 task, 동일 packet normalizer, 동일 rubric의 field benchmark 전에는 확정하지 않는다.
