---
title: "Boulder Reference Implementation Strategy"
subtitle: "Senpi · OMO-Senpi · Gajae-Code · Callee 기반 설계 및 구현 계획"
version: "0.2"
status: "Architecture Proposal"
date: "2026-07-31"
boulder_baseline: "min9lin9/boulder@10732cb0f3c1b5032ce4b2a542f8c514b658bd12"
reference_sources:
  - "code-yeongyu/senpi@c0c9e6cdc1d34ef961241e0b4fbd1633de7d12ab"
  - "code-yeongyu/oh-my-openagent@bc9295823d11b2a9afc19c2c35818a29db1c6b6c:packages/omo-senpi"
  - "Yeachan-Heo/gajae-code@e821fad7b929bc84b15b8646b1d295b481030a6f"
  - "baldaworks/callee@f4f6c3e75876007c4c9686acd6cf741b6342208e"
---

# Boulder Reference Implementation Strategy

## 0. 목적

이 문서는 Boulder를 추상적인 원칙만으로 재설계하지 않고, 다음 네 코드베이스에서 이미 검증된 구조를 **참고 구현**으로 삼아 Target Architecture와 실험 순서를 구체화한다.

```text
Senpi
→ Runtime Host와 Extension/Package/Permission substrate

OMO-Senpi
→ Harness-neutral Core와 Senpi Adapter를 분리하는 Anti-Corruption Layer

Gajae-Code
→ 외부 Workflow Harness, Human Gate, Transport-neutral Control SDK

Callee
→ Versioned SOP Resource, Static Graph Validation, Human/Script/Loop Semantics

Boulder
→ Work Contract, Policy, Evidence, Doctor, Update, Kit을 소유하는 Control Layer
```

이 문서의 목표는 코드를 복사하는 것이 아니라 다음을 판단하는 것이다.

1. 어떤 책임을 Boulder Core가 소유해야 하는가
2. 어떤 책임을 Runtime Host Adapter로 격리해야 하는가
3. 어떤 실행 의미론을 Work Contract에 일반화해야 하는가
4. 어떤 기능은 Senpi·Gajae-Code 등 외부 Runtime에 위임해야 하는가
5. SOP Definition과 실행 중인 Work Contract를 어떻게 분리해야 하는가
6. 첫 PR을 어떤 경계와 Conformance Test부터 시작해야 하는가

---

## 1. Source Pin

| Source | Pinned ref | 이 문서에서 보는 범위 |
|---|---|---|
| Boulder | `10732cb0f3c1b5032ce4b2a542f8c514b658bd12` | AS-IS CLI, profile, capability, handoff, run event |
| Senpi | `c0c9e6cdc1d34ef961241e0b4fbd1633de7d12ab` | Runtime, Extension API, package lifecycle, permissions, sessions |
| OMO | `bc9295823d11b2a9afc19c2c35818a29db1c6b6c` | `packages/omo-senpi`, `packages/senpi-task`, `packages/boulder-state` |
| Gajae-Code | `e821fad7b929bc84b15b8646b1d295b481030a6f` | SDK v3, action gate, session control, receipts and reconciliation |
| Callee | `f4f6c3e75876007c4c9686acd6cf741b6342208e` | versioned Markdown/YAML resource, static graph, Role/Script/Human/Sequential/Loop semantics |

Source가 변경되면 아래 결론은 재검증한다.

---

# 2. 네 저장소에서 직접 가져올 설계 원칙

## 2.1 Senpi에서 가져올 것

Senpi는 Boulder가 새로 구현하지 말아야 할 **Agent Runtime 영역**의 좋은 기준이다.

### Runtime Surface

```text
interactive
print / JSON
RPC
app-server
SDK embedding
```

Boulder는 이 Runtime Surface를 직접 재구현하지 않는다. 대신 `RuntimeHostAdapter`로 연결한다.

### Extension Surface

Senpi Extension은 다음을 할 수 있다.

```text
lifecycle event 구독
tool 등록
command 등록
flag 등록
UI interaction
session persistence
custom rendering
MCP server 등록
```

이는 Boulder의 Host Adapter가 사용할 수 있는 구체 API이지만, Boulder Core의 Public Contract가 Senpi API 타입을 직접 import해서는 안 된다.

### Package Lifecycle

Senpi package는 다음 Source를 지원한다.

```text
npm
git
local path
```

그리고 다음 Operation을 제공한다.

```text
install
remove
list
update self
update extensions
update models
update all
```

이 구조는 Boulder `UpdateProvider`의 참고 구현이 된다. 다만 Boulder는 Package 설치 자체보다:

```text
Discover
→ Resolve
→ Preview
→ Approve
→ Delegate Update
→ Verify
→ Record Receipt
→ Rollback or Remediate
```

를 소유해야 한다.

### Permission System

Senpi permission system은:

```text
ask
allow
deny
```

를 사용하고, Global·Project·CLI·Session rule precedence와 append-only JSONL 승인 기록을 가진다.

Boulder는 이를 그대로 Core 권한 모델로 복사하지 않는다. 대신:

```text
Effect Policy
Runtime Permission
Human Authority
```

를 분리하고, Senpi Permission은 `RuntimePermissionProvider`로 연결한다.

---

## 2.2 OMO-Senpi에서 가져올 것

`packages/omo-senpi`가 가장 직접적인 Boulder Adapter 참고 구현이다.

### 핵심 원칙

```text
omo-senpi는 adapter-only다.
Senpi runtime boundary는 omo-senpi package 안에 머문다.
Harness-neutral core package는 Senpi를 import하지 않는다.
```

Boulder도 같은 구조를 채택한다.

```text
packages/kernel
packages/contracts
packages/evidence
packages/policy
        ↑
        │ Senpi import 금지
        │
hosts/senpi
        ↓
@code-yeongyu/senpi import 허용
```

### Component Composition

OMO-Senpi는 작은 Component를 배열로 조합하고, 공통 Composer가 다음을 처리한다.

```text
ExtensionAPI capability 검사
전체 disable flag
component별 disable flag
component 등록 격리
등록 실패의 component-level isolation
shared coordinator / capture registry
```

Boulder Host Adapter도 같은 패턴을 사용한다.

```text
RuntimeHostAdapter
├─ DoctorProbeComponent
├─ WorkSubmitComponent
├─ GateBridgeComponent
├─ EvidenceBridgeComponent
├─ CancellationComponent
└─ UpdateProbeComponent
```

한 Component 실패가 전체 Host Adapter를 불필요하게 중단시키지 않되, 필수 Capability가 없으면 해당 Adapter 전체를 `unavailable`로 표시한다.

### Harness-neutral Core Package

OMO의 구조에서 특히 참고할 package:

```text
@oh-my-opencode/boulder-state
@oh-my-opencode/senpi-task
@oh-my-opencode/omo-config-core
@oh-my-opencode/delegate-core
@oh-my-opencode/team-core
```

이들은 Host Adapter보다 안쪽에 놓이고, Senpi coupling이 필요한 부분은 별도 package에 격리한다.

### Work Tracking Seed

`boulder-state`는:

```text
active work
work map
session IDs
task sessions
plan progress
JSON state persistence
legacy state migration
```

을 다루는 작은 Pure State Machine이다.

Boulder v2에서는 이를 그대로 최종 Work Contract로 삼지 않고:

```text
Work Tracking Compatibility Adapter
```

로 활용한다.

### Durable Task Seed

`senpi-task`는 다음 의미론의 강한 참고 구현이다.

```text
7개 Task Status
persistent JSONL record store
in-process / RPC process runner
TTL and reconcile lifecycle
exactly-once completion notification
durable mailbox
reservation and commit
restart deduplication
chaos test
```

R05 Work Contract의 `Attempt`, `Terminal State`, `Recovery`, `Exactly-once Receipt`, `Process Reattach`를 검증할 때 직접 비교한다.

---

## 2.3 Gajae-Code에서 가져올 것

Gajae-Code는 Boulder가 Host-neutral Control Surface를 설계할 때 참고할 구현이다.

### Runtime과 Integration 분리

Gajae-Code SDK는:

```text
GJC Session
→ loopback WebSocket / stdio / Unix socket
→ external client
```

구조를 사용한다.

Telegram, Discord, Slack 등 Integration은 Core를 변경하지 않고 같은 JSON Protocol의 Client로 동작한다.

Boulder도 다음 원칙을 채택한다.

```text
새 Host나 UI를 추가할 때 Kernel을 수정하지 않는다.
Host Adapter는 stable control protocol의 client다.
```

### Action Gate

Gajae-Code는 다음을 구분한다.

```text
action_needed.id
= 현재 화면에 표시된 transient action의 reply authority

workflowGateId
= durable workflow gate의 correlation metadata
```

이 구분은 Boulder에 매우 중요하다.

Boulder는:

```text
Presentation Action ID
Durable Gate ID
Approval Receipt ID
```

를 서로 다른 식별자로 둔다.

UI에 표시된 Action ID를 장기 Authority ID로 사용하지 않는다.

### Idempotent Reply

Gajae-Code reply는 `idempotencyKey`를 지원하고:

```text
same key + same body
→ re-ack

same key + different body
→ idempotency_conflict
```

로 처리한다.

Boulder의 `ApprovalCommand`, `GateAnswerCommand`, `EffectCommitCommand`도 같은 규칙을 사용한다.

### Prompt Claim과 Terminal Outcome

Gajae-Code는 Prompt의 accepted receipt를 terminal success와 구분한다.

```text
accepted
= 요청을 받았다는 pending claim

terminal outcome
= stopped 또는 failed
```

Boulder도 다음을 금지한다.

```text
Adapter가 요청을 받음
≠ Task 완료
```

따라서 Runtime Adapter 호출 결과는 최소 세 단계로 나눈다.

```text
AcceptedReceipt
ProgressEvent
TerminalReceipt
```

---


## 2.4 Callee에서 가져올 것

Callee는 공식 문서에서 자신을 SOP 제품이라고 부르기보다, **versioned Markdown/YAML agent resource와 deterministic workflow runtime**으로 정의한다. 그러나 그 구조는 Boulder가 산업 SOP를 기계 검증 가능한 자산으로 모델링하는 데 직접적인 참고가 된다.

### Versioned SOP Resource

Callee resource는 다음 envelope를 가진다.

```yaml
apiVersion: callee.metalagman.dev/v1alpha1
kind: Role | Script | Human | Sequential | Loop
spec: {}
```

Markdown은 기본 authoring format이고 YAML은 동일 schema object를 표현한다. Unknown field는 schema-defined object boundary에서 거절되며, JSON Schema뿐 아니라 semantic, template, state, graph validation이 함께 수행된다.

Boulder는 이 패턴을 다음처럼 일반화한다.

```yaml
apiVersion: boulder.dev/v1alpha1
kind: Procedure
metadata:
  id: org.example.release-review
  version: 0.1.0
spec:
  nodes: []
  inputs: []
  outputs: []
  policies: []
  evaluations: []
```

`Procedure` 또는 `SOP Definition`은 반복 가능한 정적 자산이고, `Work Contract`는 한 번의 실행을 위해 SOP와 현재 입력·Profile·Capability binding을 결합한 불변 실행 계약이다.

```text
SOP Definition
= reusable procedure

Work Contract
= one instantiated execution revision
```

### Node Semantics

Callee kind를 Boulder 후보 node로 다음처럼 매핑한다.

| Callee | Boulder candidate | 의미 |
|---|---|---|
| `Role` | `AgentTask` | AI/agent-backed task |
| `Script` | `DeterministicTask` 또는 `CheckTask` | local deterministic action or validation |
| `Human` | `HumanTask` | operator-backed input, review, approval or decision |
| `Sequential` | `Sequence` | ordered composition |
| `Loop` | `BoundedLoop` | bounded repetition with explicit exhaustion policy |

Callee의 모든 node는 input을 받고, 하나의 shared root-run state를 갱신할 수 있으며, artifact 또는 structured orchestration outcome을 반환한다. Boulder는 이 공통 node boundary를 참고하되, shared mutable state 대신 input/output/event/receipt를 우선하고 state mutation은 명시적 patch로 제한한다.

### Static Graph Validation

Callee는 실행 전에 다음을 거절한다.

```text
invalid resources
unresolved child references
cycles
duplicate resource IDs
duplicate effective IDs
invalid edge authorization
```

Boulder SOP Compiler도 실행 전에 다음을 보장해야 한다.

```text
schema valid
references resolvable
graph acyclic unless explicit bounded loop
effective node IDs unique
all Capability requirements resolvable or explicitly deferred
Human/Authority requirements declared
every loop bounded
every terminal path has output or failure semantics
```

### Human as a First-class Node

Callee의 `Human`은 TTY에서 한 번의 nonblank response를 받고 shared state와 output artifact에 기록된다. 최신 pinned commit은 root Human과 Role → Human → Script → 다음 Loop iteration을 PTY smoke test로 검증한다.

Boulder는 이를 더 일반화한다.

```text
HumanTask
├─ clarification
├─ evidence request
├─ review
├─ approval
├─ decision
└─ override
```

단, 단순 문자열 response와 법적·조직적 Approval Receipt를 같은 것으로 취급하지 않는다. Human response는 input/evidence가 될 수 있지만, Authority scope와 artifact hash에 결박된 Approval은 별도 contract다.

### Edge-scoped Authority

Callee의 `canEscalate`는 Role resource의 전역 속성이 아니라 **parent-to-child occurrence edge의 권한**이다. 동일 Role도 SOP의 어느 위치에 배치되었는지에 따라 Loop 완료 권한이 달라진다.

Boulder는 이 아이디어를 다음에 적용한다.

```text
Reusable Node Definition
≠ Runtime Authority

Authority belongs to:
procedure occurrence
+ transition/effect scope
+ work revision
+ actor
+ expiry
```

따라서 `mayCompleteLoop`, `mayRequestApproval`, `mayCommitEffect`, `mayOverrideFinding` 같은 권한은 reusable Skill이나 Role 자체가 아니라 Procedure edge 또는 Policy binding에 둔다.

### Bounded Loop and Explicit Termination

Callee Loop는 `maxIterations`와 `onExhausted: fail|complete`를 요구한다. 정상 Role return은 recoverable progress이며, `fail`은 fatal condition이고, authorized `escalate`만 Loop를 즉시 완료할 수 있다.

Boulder SOP v0도 다음 원칙을 채택한다.

```text
unbounded implicit loop 금지
iteration limit 또는 external deadline 필수
normal result / retry / revision / fatal failure 분리
loop completion authority 명시
exhaustion outcome 명시
```

### Host Integration and Runtime Provider Separation

Callee는 coding-host integration과 ACP runtime provider를 분리한다. Codex plugin으로 Callee를 호출하면서 실제 Role provider는 Claude가 될 수 있다.

이는 Boulder의 다음 원칙을 강화한다.

```text
Host != Runtime
SOP != Profile
Role requirement != concrete provider
```

### Callee의 deliberate limits

Callee는 현재 다음을 명시적으로 제공하지 않는다.

```text
server
durable thread/state store
cross-process continuation
Parallel kind
provider handle binding
```

따라서 Callee는 Boulder의 전체 Durable Workflow Runtime이 아니라 다음 두 역할로 사용한다.

1. SOP schema와 deterministic composition의 reference semantics
2. 짧은 local SOP 실행을 위한 optional ProcedureEngineAdapter

장기 실행, resume, distributed scheduling과 durable evidence는 Boulder 또는 별도 durable runtime layer가 소유한다.

---

# 3. Boulder 목표 책임 경계

## 3.1 Boulder가 소유할 것

```text
Work Contract
Workflow State Semantics
Effect Taxonomy
Authority and Approval Binding
Capability Requirement
Runtime Profile
Industry Kit
Evidence and Receipt Contracts
Doctor Aggregation
Update Planning and Verification
Critique Contract
Compound Candidate Governance
Architecture Fitness Functions
```

## 3.2 Runtime이 소유할 것

Senpi, Gajae-Code, Codex 또는 다른 Runtime이 소유한다.

```text
Agent loop
Model/provider selection implementation
Tool execution
Session UI
Context compaction
Subagent process management
Runtime-local permission prompts
Message queue
Terminal rendering
Runtime-specific package loading
```

## 3.3 Host Adapter가 소유할 것

```text
Runtime discovery
Runtime version and health
Work submission translation
Runtime session correlation
Action gate bridge
Cancellation and steering
Runtime event normalization
Runtime-local evidence extraction
Package/update provider bridge
Runtime-specific errors
```

---

# 4. Target Logical Architecture

```text
┌─────────────────────────────────────────────────────────┐
│ Experience                                               │
│ Codex Host · CLI Host · Future Desktop/API               │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│ Boulder Application Services                             │
│ Doctor · Run · Status · Explain · Update · Compound       │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│ Boulder Kernel                                           │
│ Work Contract · State · Gate · Effect · Policy · Receipt  │
└──────────────┬───────────────────────┬───────────────────┘
               │                       │
┌──────────────▼─────────────┐  ┌─────▼──────────────────┐
│ Profile / Kit Resolver      │  │ Evidence / Critique     │
│ Runtime Profile             │  │ Event Ledger            │
│ Industry Kit                │  │ Check / Critic / Replay │
└──────────────┬─────────────┘  └─────┬──────────────────┘
               │                       │
┌──────────────▼───────────────────────▼───────────────────┐
│ Ports                                                    │
│ RuntimeHostAdapter · CapabilityAdapter · UpdateProvider   │
│ DoctorProbe · AuthorityProvider · ArtifactStore           │
└───────┬─────────────────┬─────────────────┬──────────────┘
        │                 │                 │
┌───────▼────────┐ ┌──────▼─────────┐ ┌────▼──────────────┐
│ hosts/senpi    │ │ hosts/gajae     │ │ hosts/codex       │
│ Senpi API      │ │ GJC SDK v3      │ │ Codex surface     │
└───────┬────────┘ └──────┬─────────┘ └────┬──────────────┘
        │                 │                 │
┌───────▼─────────────────▼─────────────────▼──────────────┐
│ External Runtime and Capability Ecosystem                │
│ Senpi · Gajae-Code · MCP · CLI · Library · Skills        │
└─────────────────────────────────────────────────────────┘
```

---


# 4A. Callee 반영 후 SOP Layer

## 4A.1 SOP의 위치

SOP는 Runtime Profile이 아니라 Industry Kit에 포함되는 versioned asset이다.

```text
Industry Kit
├─ vocabulary/
├─ procedures/          # SOP Definition
├─ policies/
├─ templates/
├─ evaluations/
└─ fixtures/
```

Profile은 SOP가 어떤 Host·Runtime·Model·Security Mode에서 실행되는지를 정한다.

```text
Kit / SOP
= what work means and in what order

Profile
= how and where it runs
```

## 4A.2 SOP Compiler

```text
SOP Definition
+ Current Inputs
+ Runtime Profile
+ Capability Registry
+ Policy Context
        ↓
Static Validation
        ↓
Resolved Procedure Graph
        ↓
Work Contract revision N
```

Compiler는 Concrete Provider를 SOP 파일에 요구하지 않는다. Callee-style `Role.spec.provider.type`는 Callee Adapter 내부 호환 필드로만 사용하고, Boulder-native SOP에서는 `capabilityRequirement` 또는 `roleClass`를 사용한다.

## 4A.3 SOP Runtime 선택

```text
ProcedureEngineAdapter
├─ callee-local
├─ boulder-inmemory-experimental
└─ future-durable-engine
```

`callee-local`은 짧고 TTY가 있는 local run에 적합하다. Durable resume가 필요한 SOP는 다른 engine을 사용해야 하며, engine 선택은 Profile 또는 orchestration policy가 담당한다.

## 4A.4 Procedure Contract Candidate

```ts
export interface ProcedureDefinition {
  apiVersion: "boulder.dev/v1alpha1";
  kind: "Procedure";
  metadata: {
    id: string;
    version: string;
  };
  spec: {
    inputs: ProcedureInputSpec[];
    outputs: ProcedureOutputSpec[];
    nodes: ProcedureNode[];
    policies: PolicyRef[];
    evaluations: EvaluationRef[];
  };
}

export type ProcedureNode =
  | AgentTaskNode
  | DeterministicTaskNode
  | HumanTaskNode
  | SequenceNode
  | BoundedLoopNode;
```

첫 버전에서 `Decision`과 `Parallel`을 억지로 넣지 않는다. 다만 Callee에 없다는 이유만으로 영구 제외하지도 않는다.

## 4A.5 Procedure와 Work의 분리

| 구분 | Procedure / SOP | Work Contract |
|---|---|---|
| 목적 | 반복 가능한 표준 절차 | 한 번의 구체 실행 |
| Version | 독립 SemVer | revision integer + source procedure version |
| 입력 | input schema | resolved artifact/evidence refs |
| Capability | requirement | resolved binding 또는 resolution policy |
| Authority | policy requirement | actual approval/gate receipt |
| 상태 | 없음 또는 authoring lifecycle | runtime state |
| 변경 | 새 SOP version | 새 Work revision |
| Compound | candidate SOP 생성 | 실행 evidence 제공 |


---

# 5. Candidate Public Ports

## 5.1 RuntimeHostAdapter

```ts
export interface RuntimeHostAdapter {
  readonly adapterId: string;
  readonly runtimeKind: "senpi" | "gajae-code" | "codex" | string;

  probe(input: RuntimeProbeInput): Promise<RuntimeProbeReport>;

  startSession(
    input: StartRuntimeSessionInput,
  ): Promise<RuntimeSessionReceipt>;

  submitWork(
    input: RuntimeWorkSubmission,
  ): Promise<AcceptedReceipt>;

  observe(
    input: ObserveRuntimeInput,
  ): AsyncIterable<NormalizedRuntimeEvent>;

  answerGate(
    input: GateAnswerCommand,
  ): Promise<GateAnswerReceipt>;

  cancel(
    input: CancelRuntimeCommand,
  ): Promise<CancelReceipt>;

  shutdown(
    input: ShutdownRuntimeCommand,
  ): Promise<ShutdownReceipt>;
}
```

### Senpi binding

```text
registerTool / command / event
session JSONL
ExtensionAPI capability probe
permission event
package inventory
```

### Gajae-Code binding

```text
SDK endpoint discovery
action_needed / action_resolved
turn.prompt / turn.prompt_status
reply with idempotencyKey
session query and control
```

---

## 5.2 CapabilityAdapter

```ts
export interface CapabilityAdapter<I, O> {
  readonly capabilityId: string;
  readonly bindingId: string;

  describe(): CapabilityBindingDescriptor;
  probe(): Promise<CapabilityHealthReport>;
  preview(input: I): Promise<EffectPreview>;
  execute(input: I, ctx: ExecutionContext): Promise<O>;
  verify(output: O, ctx: VerificationContext): Promise<CheckReceipt>;
}
```

MCP, CLI, Library는 서로 다른 `bindingId`가 될 수 있지만 같은 `capabilityId`를 제공할 수 있다.

---

## 5.3 DoctorProbe

```ts
export interface DoctorProbe {
  readonly probeId: string;
  readonly mutatesEnvironment: false;

  inspect(ctx: DoctorContext): Promise<DoctorFinding[]>;
}
```

다음 검사는 별도 Probe로 분리한다.

```text
Senpi runtime
Senpi packages
OMO-Senpi adapter
Gajae-Code SDK endpoint
MCP servers
CLI capabilities
Profile/Kit compatibility
Lockfile drift
Permission risk
```

---

## 5.4 UpdateProvider

```ts
export interface UpdateProvider {
  readonly providerId: string;

  check(input: UpdateCheckInput): Promise<UpdateCandidate[]>;
  prepare(input: UpdateSelection): Promise<UpdatePlan>;
  apply(input: ApprovedUpdatePlan): Promise<UpdateReceipt>;
  verify(input: UpdateReceipt): Promise<UpdateVerification>;
  rollback(input: RollbackRequest): Promise<RollbackReceipt>;
}
```

Senpi Package Manager는 하나의 Provider다.

```text
senpi package source
npm source
git source
local path source
```

Boulder Update는 이 Provider를 호출하기 전에 Compatibility와 Human Approval을 처리한다.

---


## 5.5 ProcedureEngineAdapter

```ts
export interface ProcedureEngineAdapter {
  readonly engineId: string;

  validate(
    definition: ProcedureDefinition,
  ): Promise<ProcedureValidationReport>;

  resolve(
    input: ResolveProcedureInput,
  ): Promise<ResolvedProcedureGraph>;

  execute(
    input: ExecuteResolvedProcedureInput,
  ): AsyncIterable<ProcedureRuntimeEvent>;

  answerHumanTask(
    input: HumanTaskAnswerCommand,
  ): Promise<HumanTaskAnswerReceipt>;

  cancel(
    input: CancelProcedureRunCommand,
  ): Promise<CancelReceipt>;
}
```

Callee binding은 다음을 사용할 수 있다.

```text
agent validate
agent view --json
doctor --graph
agent run
Role / Script / Human / Sequential / Loop
```

그러나 Boulder Event와 Receipt는 Callee stderr text 자체가 아니라 adapter가 normalize한 structured event로 저장한다.

---

# 6. R04·R05를 닫기 위한 코드 실험


## E-SOP-01 — Callee-style SOP Static Compiler

### 목표

Callee의 versioned envelope와 graph validation에서 출발해 Boulder `ProcedureDefinition`을 `ResolvedProcedureGraph`로 컴파일한다.

### Fixture

```text
AgentTask
→ HumanTask
→ DeterministicTask
→ BoundedLoop
```

### 통과 조건

```text
unknown fields rejected
unresolved refs rejected
duplicate effective IDs rejected
implicit cycles rejected
all loops bounded
Host/Provider literal in Boulder-native SOP = 0
```

## E-SOP-02 — Human Loop Proof

### 목표

다음 의미를 동일 Run에서 검증한다.

```text
Agent result
→ Human response
→ deterministic validation
→ next loop iteration
```

### 추가 Boulder 조건

```text
Human response is not automatically Approval
HumanTask occurrence has stable node ID
response event and state patch are replayable
loop completion authority is edge/policy-scoped
```

## E-SOP-03 — Procedure to Work Contract

### 목표

같은 SOP Definition을 서로 다른 Profile로 instantiate한다.

```text
Profile A: senpi-local
Profile B: gajae-external
```

### 통과 조건

```text
Procedure file unchanged
Work Contract binding differs
domain vocabulary unchanged
Host/runtime literals absent from Procedure
```

## E-SOP-04 — SOP Version and Compound

### 목표

세 번의 successful run에서 발견한 개선안을 active SOP에 자동 반영하지 않고 새 candidate version으로 생성한다.

```text
Procedure v1.0.0
→ run evidence
→ Compound Candidate
→ review/replay
→ Procedure v1.1.0 candidate
→ explicit promotion
```


## E-ADAPTER-01 — Two Runtime Host Adapters

### 목표

Senpi와 Gajae-Code를 동일한 `RuntimeHostAdapter` Port로 연결한다.

### 필수 시나리오

```text
Probe
Start session
Submit work
Receive action gate
Answer gate idempotently
Observe terminal outcome
Cancel
Shutdown
```

### 통과 조건

- Kernel은 Senpi·GJC 타입을 import하지 않는다.
- Runtime별 event는 공통 Event로 normalize된다.
- `accepted`와 `completed`가 구분된다.
- Gate answer duplicate가 안전하다.
- Runtime unavailable은 stable error로 반환된다.

---

## E-WORK-01 — Three Scenario Work Harness

### Scenario 1

```text
Local-only
No approval
Complete
```

### Scenario 2

```text
External effect
Await approval
Commit effect
Receipt
Complete
```

### Scenario 3

```text
Failure
→ Retry same revision
→ Critique
→ New revision
→ Rollback
→ Execute new revision
```

### Senpi-task에서 검증할 의미

```text
Task terminal states
JSONL persistence
attempt
reconcile
exactly-once completion
crash recovery
in-process / process runner
```

### Gajae-Code에서 검증할 의미

```text
transient action ID
durable workflow gate correlation
idempotent reply
pending claim
terminal outcome
```

---

## E-KIT-01 — Profile / Kit Boundary

### Kit A

```text
oss-maintainer-kit
```

### Kit B

```text
document-operations-kit
```

### Profile A

```text
senpi-local
```

### Profile B

```text
gajae-external
```

### Matrix

| Kit | Senpi Profile | Gajae Profile |
|---|---:|---:|
| OSS Maintainer | required | required |
| Document Operations | required | required |

### 통과 조건

```text
두 번째 Kit 추가 시 Kernel 변경 0
Kit에 senpi/gajae/codex literal 0
Profile에 OSS/document vocabulary 0
같은 Capability Requirement가 다른 Adapter로 resolve
```

---

# 7. Package Layout Proposal

```text
packages/
├─ contracts/
│  ├─ work-contract
│  ├─ workflow-event
│  ├─ effect
│  ├─ authority
│  ├─ evidence
│  ├─ profile
│  ├─ kit
│  └─ capability
├─ kernel/
│  ├─ state
│  ├─ orchestration
│  ├─ gate
│  ├─ policy
│  └─ errors
├─ application/
│  ├─ doctor
│  ├─ run
│  ├─ update
│  ├─ critique
│  └─ compound
├─ procedure/
│  ├─ definition
│  ├─ compiler
│  ├─ graph
│  └─ conformance
├─ ports/
│  ├─ runtime-host
│  ├─ capability-adapter
│  ├─ update-provider
│  ├─ authority-provider
│  ├─ artifact-store
│  └─ procedure-engine
├─ hosts/
│  ├─ senpi
│  ├─ gajae-code
│  ├─ codex
│  └─ callee
├─ update-providers/
│  ├─ senpi-packages
│  ├─ npm
│  └─ git
└─ compatibility/
   ├─ boulder-v1
   └─ omo-boulder-state

kits/
├─ oss-maintainer/
└─ document-operations/

experimental/
├─ callee-sop-compiler/
├─ human-loop-proof/
├─ two-runtime-adapter/
├─ three-scenario-work/
└─ two-kit-boundary/
```

물리적 npm package 분리는 Contract와 dependency direction이 검증된 후에 한다. 첫 단계에서는 동일 저장소 안의 논리 경계로 시작한다.

---

# 8. 첫 PR 시퀀스

## PR-1 — Reference Baseline and Architecture Space

```text
Source pins
Official Glossary
ADR template
experimental/ directory
forbidden dependency rules
```

제품 Runtime 변경 없음.

## PR-2 — RuntimeHostAdapter Candidate

```text
Port type
Normalized Runtime Event
Accepted / Terminal Receipt 분리
Gate Answer Command
Conformance fixture
```

## PR-3 — Senpi Probe Adapter

```text
read-only runtime/version/package probe
ExtensionAPI capability detection
no work execution
```

## PR-4 — Gajae-Code Probe Adapter

```text
SDK discovery-file parsing
endpoint health
capability/version query
no prompt execution
```

## PR-5 — Callee SOP Schema and Read-only Adapter

```text
ProcedureDefinition candidate
Callee catalog/schema/graph probe
Role/Script/Human/Sequential/Loop mapping
no workflow execution yet
```

## PR-6 — SOP Compiler and Human Loop Harness

```text
static graph validation
Procedure → Work Contract
Human response → deterministic check → next iteration
```

## PR-7 — Two Runtime Adapter Harness

```text
submit
gate
reply
terminal
cancel
failure normalization
```

## PR-8 — Work Semantics Harness

```text
three scenarios
event replay
retry vs revision
rollback vs compensation
```

## PR-9 — Two Kit Boundary Harness

```text
oss-maintainer
document-operations
senpi/gajae profile matrix
zero-Core-change assertion
```

## PR-10 — Doctor v2 Vertical Slice

```text
Senpi
OMO-Senpi
Gajae-Code
Callee SOP catalog/graph
Profile/Kit
stable PASS/WARN/FAIL
```

## PR-11 — Update Plan Vertical Slice

```text
Senpi package provider
check only
impact preview
no automatic apply
```

---

# 9. Architecture Fitness Functions

```text
boundary_kernel_must_not_import_senpi
boundary_kernel_must_not_import_gajae_code
boundary_host_adapter_must_not_own_domain_policy

contract_runtime_adapter_accepts_minimum_valid
contract_procedure_rejects_unknown_field
contract_procedure_requires_bounded_loop
boundary_procedure_must_not_reference_runtime_literal
contract_runtime_event_rejects_unknown_terminal
contract_gate_answer_requires_idempotency_key

workflow_acceptance_is_not_completion
workflow_retry_preserves_revision
workflow_critique_material_change_creates_revision
workflow_completion_requires_terminal_receipt

doctor_probe_must_not_mutate
doctor_runtime_unavailable_is_not_pass

kit_must_not_reference_runtime_literal
profile_must_not_reference_domain_vocabulary
second_kit_requires_zero_kernel_change

update_default_is_plan_not_apply
update_apply_requires_approval
update_failure_requires_verification_or_rollback

compound_candidate_never_auto_promotes
```

---

# 10. 명시적으로 복사하지 않을 것

## Senpi에서 복사하지 않음

```text
Agent loop
TUI
Provider catalog
Compaction
Model fallback
Session editor
Runtime package manager 전체 구현
```

## OMO-Senpi에서 복사하지 않음

```text
Ultrawork trigger
Agent personas
Team Mode
Specific model categories
Senpi-specific component names
OMO configuration vocabulary
```

가져올 것은 **Adapter-only boundary와 component composition pattern**이다.

## Gajae-Code에서 복사하지 않음

```text
SDK v3 frame 전체
GJC session directory convention
GJC-specific workflow command set
tmux/worktree semantics
```

가져올 것은:

```text
transport-neutral control client
transient action vs durable gate
idempotent reply
accepted claim vs terminal outcome
endpoint discovery and token hygiene
```

---

## Callee에서 복사하지 않음

```text
Role 안의 concrete provider binding을 Boulder SOP 표준으로 사용
TTY-only Human interaction을 유일한 Human interface로 사용
ephemeral shared state를 evidence system of record로 사용
last-successful-write-wins를 모든 업무 상태 규칙으로 사용
LLM final-line text control record를 Boulder의 장기 public protocol로 사용
Parallel·Decision이 없다는 현재 Callee 제한을 Boulder 영구 제한으로 사용
```

가져올 것은 다음이다.

```text
versioned Markdown/YAML authoring
strict schema + semantic + graph validation
Role/Script/Human/Sequential/Loop의 작은 문법
bounded loop and explicit exhaustion
edge-scoped escalation authority
Host integration와 runtime provider 분리
doctor graph and preflight validation
```

---

# 11. 담당자 학습 우선순위 변경

이제 담당자는 일반 오픈소스보다 아래 순서로 사용자 코드부터 읽는다.

## 1순위 — Callee SOP Model

읽을 파일:

```text
docs/concepts/architecture.md
docs/reference/agent-resources.md
docs/reference/workflow-semantics.md
docs/guides/cli.md
internal/agent/schema.json
internal/workflow/runner.go
scripts/smoke-test-callee-human.sh
examples/workflows/goalkeeper.md
```

학습 목표:

```text
versioned procedure resource
strict validation and graph resolution
Human as first-class node
bounded Loop and exhaustion
edge-scoped authority
root artifact and state semantics
SOP definition vs one run
```

## 2순위 — OMO-Senpi

읽을 파일:

```text
packages/omo-senpi/AGENTS.md
packages/omo-senpi/src/extension/types.ts
packages/omo-senpi/src/extension/compose.ts
packages/omo-senpi/src/extension/index.ts
packages/omo-senpi/plugin/README.md
```

학습 목표:

```text
adapter-only boundary
defensive capability detection
component-level isolation
peer externalization
generated package
live QA and evidence rules
```

## 3순위 — Senpi Task and Boulder State

```text
packages/senpi-task/AGENTS.md
packages/boulder-state/AGENTS.md
```

학습 목표:

```text
persistent state
task terminal semantics
exactly-once completion
reconcile and reattach
JSONL record store
chaos test
small pure state core
```

## 4순위 — Gajae-Code SDK

```text
docs/sdk.md
docs/sdk-rpc-parity-audit.md
docs/sdk-embedding.md
```

학습 목표:

```text
external control protocol
session discovery
gate correlation
idempotency
claim reconciliation
transport neutrality
security boundary
```

## 5순위 — Senpi Runtime and Package System

```text
packages/coding-agent/docs/extensions.md
packages/coding-agent/docs/packages.md
packages/coding-agent/src/core/extensions/types.ts
packages/coding-agent/src/core/extensions/builtin/permission-system/AGENTS.md
```

학습 목표:

```text
Host Extension contract
package install/update/remove
project trust
permission precedence
append-only approval record
interactive/non-interactive difference
```

---

# 12. 첫 의사결정

이 세 코드베이스를 참고하면 다음은 이제 강하게 제안할 수 있다.

## 제안 A

> Boulder Core는 Agent Runtime이 아니다.

## 제안 B

> Runtime별 Integration은 `hosts/<runtime>` Adapter Package에 격리한다.

## 제안 C

> Work accepted receipt와 terminal receipt를 분리한다.

## 제안 D

> UI action ID, durable gate ID, approval receipt ID를 분리한다.

## 제안 E

> Runtime Permission과 Boulder Human Authority를 같은 개념으로 취급하지 않는다.

## 제안 F

> `/boulder doctor`는 Runtime·Adapter·Package를 읽기 전용으로 진단한다.

## 제안 G

> `/boulder update`는 외부 Package Manager를 조정하지만 기본 동작은 Update Plan 생성이다.

## 제안 H

> SOP Definition과 Work Contract는 별도 계약이다. SOP는 재사용 자산이고 Work Contract는 한 실행의 immutable revision이다.

## 제안 I

> Human, deterministic Script, Agent, Sequence, bounded Loop를 공통 Procedure Node로 모델링하되 Human response와 Approval Receipt를 분리한다.

## 제안 J

> Loop 종료·Escalation·Effect Commit 권한은 reusable Role 자체가 아니라 SOP occurrence edge와 Policy binding에 속한다.

R04 Profile·Kit과 R05 Work Contract의 최종 계약은 위 실험 전까지 Candidate 상태를 유지한다.

---

# 13. 즉시 다음 행동

```text
1. 네 Reference Source를 Research Source Register에 추가
2. Callee 기반 SOP Definition / Procedure Node candidate 작성
3. E-SOP-01과 E-SOP-02 착수
4. ADR-0002와 ADR-0003의 Counterevidence 갱신
5. RuntimeHostAdapter Candidate 작성
6. Senpi/Gajae/Callee Probe Adapter fixture 작성
7. E-ADAPTER-01 착수
8. senpi-task와 Callee 의미론을 이용해 E-WORK-01 착수
9. 결과로 R04·R05와 SOP contract를 재판정
```
