# boulder Codex Skill 사용설명서

`boulder`는 Codex에서 Boulder를 호출하기 위한 로컬 skill 이름입니다. 새 repo에서 `boulder로 초기설정 해줘`라고 요청하면, Codex가 Boulder CLI를 통해 repo onboarding, 계획, 검증, evidence export를 순서대로 진행하는 흐름입니다.

## 결론

네. 신규 repo에서는 이렇게 요청하면 됩니다.

```text
boulder로 현재 repo 초기설정 해줘.
```

대상 repo가 현재 Codex 작업 디렉터리가 아니면 경로를 명시합니다.

```text
boulder로 <repo> 초기설정 해줘.
```

## 추천 프롬프트

가장 안정적인 첫 실행 요청은 아래 형식입니다.

```text
boulder로 현재 repo 초기설정 해줘.
init -> quickstart -> inspect -> doctor -> pipeline medium -> verify --dry-run -> export 순서로 진행하고,
생성/수정된 파일, 실패한 gate, 다음 할 일을 요약해줘.
```

외부 공개 OSS 수준까지 보고 싶으면 이렇게 요청합니다.

```text
boulder로 이 repo가 외부 사용자가 반복해서 쓸 수 있는 OSS 제품 수준인지 점검해줘.
release-check, replay-check, product-readiness, service-readiness를 실행하고 부족점을 우선순위로 정리해줘.
```

반복 작업을 repo 단위 workflow로 만들고 싶으면 먼저 bootstrap designer를 씁니다.

```text
Use $boulder-bootstrap-designer to turn this repeated task into a Boulder workflow profile.
```

이 흐름은 skill first, CLI later입니다. `boulder-bootstrap-designer`는 `programming-heavy`, `research-corpus`, `release-safe`, `issue-triage`, `docs-reviewer` 중 하나로 반복 작업을 분류하고, 이후 `boulder profile save/use`, `capability import`, `quickstart`, `doctor` 명령을 제안합니다. GJC, LazyCodex, context-mode, private corpus는 `doctor`가 로컬 설치나 inventory를 확인하기 전까지 후보 capability입니다.

## Codex 내부 실행 방식

로컬 Codex에서는 `bunx`나 `npx`를 기본 호출로 쓰지 않습니다. Codex sandbox에서 tempdir 쓰기나 npm registry 접근이 막힐 수 있기 때문입니다.

대신 `boulder` skill은 설치된 wrapper를 통해 로컬 Boulder checkout을 직접 호출합니다.

```bash
bash <codex-home>/skills/boulder/scripts/boulder-local.sh inspect --cwd <repo> --json
```

실제 초기설정 sequence는 다음과 같습니다.

```bash
bash <codex-home>/skills/boulder/scripts/boulder-local.sh init --cwd <repo>
bash <codex-home>/skills/boulder/scripts/boulder-local.sh quickstart --cwd <repo>
bash <codex-home>/skills/boulder/scripts/boulder-local.sh inspect --cwd <repo> --json
bash <codex-home>/skills/boulder/scripts/boulder-local.sh doctor --cwd <repo> --json
bash <codex-home>/skills/boulder/scripts/boulder-local.sh pipeline --cwd <repo> --friction medium --json
bash <codex-home>/skills/boulder/scripts/boulder-local.sh verify --cwd <repo> --dry-run
bash <codex-home>/skills/boulder/scripts/boulder-local.sh export --cwd <repo>
```

`init`은 기본 executor preference를 `boulder.yaml`에 설정합니다. planning은 `gajae-code`, execution은 `lazycodex`, mode는 둘 다 `detect-and-suggest`입니다. 다만 이것은 설치 완료를 뜻하지 않습니다. `quickstart`에서는 `executor-planning`, `executor-execution` 체크로 preference가 보이고, `doctor --json`에서는 로컬 Codex inventory에서 발견될 때만 `status: available`, 없으면 `status: configured-unverified`로 보여야 합니다.

GJC는 최신 Hermes MCP bridge 기준으로 감지합니다. `doctor`가 아래 표면 중 하나를 보면 planning adapter를 실제 사용 가능 상태로 봅니다.

- `gajae-code` 또는 `gjc`
- `gjc_coordinator`, `gjc-coordinator`, `gjc-coordinator-mcp`
- `gjc-delegation`
- `gjc_delegate_*`

GJC bridge 자체를 확인할 때는 Boulder가 아래 비파괴 smoke command를 후보로 보여줍니다.

```bash
gjc mcp-serve coordinator --check --json
gjc setup hermes --root . --smoke
```

`gjc_delegate_plan` 같은 실제 delegation은 packet review와 사용자 승인 이후에만 후보 명령으로 취급합니다.

단, 이것은 live command 허가가 아닙니다. GJC와 LazyCodex live command는 사용자가 명시적으로 승인할 때만 실행합니다.

`--cwd`는 항상 Boulder command 뒤에 둡니다.

```bash
# 맞음
bash <codex-home>/skills/boulder/scripts/boulder-local.sh inspect --cwd <repo>

# 피해야 함
bash <codex-home>/skills/boulder/scripts/boulder-local.sh --cwd <repo> inspect
```

## Friction 기준

`boulder`는 작업 마찰도에 따라 pipeline 깊이를 다르게 잡습니다.

- `low`: README, labels, 작은 문서 정리
- `medium`: 신규 repo 초기설정, 일반 기능 구현, onboarding 보강
- `high`: release, CI, security, public OSS 제출 전 점검, cross-repo 작업

초기설정은 보통 `medium`으로 시작하고, release나 공개 제출 전에는 `high`로 올립니다.

## 초기설정 결과물

초기설정 후 Codex는 최소한 아래를 보고해야 합니다.

- 어떤 Boulder command를 실행했는지
- 생성 또는 수정된 파일
- repo에서 감지한 test/build/CI 경로
- `gajae-code` planning adapter 설정 상태
- `lazycodex` execution adapter 설정 상태
- doctor가 발견한 capability gap
- pipeline plan의 friction과 주요 gate
- `verify --dry-run` 결과
- export evidence 위치
- 다음 우선순위 작업

## 자주 쓰는 요청

```text
boulder로 이 repo quickstart만 점검해줘.
```

```text
boulder로 pipeline high를 만들고 release 전에 막히는 gate를 찾아줘.
```

```text
boulder로 doctor 실행해서 Codex skill, MCP, CI, evidence 준비 상태를 평가해줘.
```

```text
boulder로 release-check 후 npm publish 전에 부족한 점을 찾아줘.
```

```text
boulder로 export evidence를 만들고 README에 다음 사용자가 볼 경로를 정리해줘.
```

## 안 잡힐 때

새로 설치한 skill은 현재 Codex 세션에 바로 로드되지 않을 수 있습니다. 새 Codex 세션을 열면 `boulder` 호출이 더 안정적으로 잡힙니다.

그래도 안 잡히면 wrapper를 직접 호출하면 됩니다.

```bash
bash <codex-home>/skills/boulder/scripts/boulder-local.sh --version
bash <codex-home>/skills/boulder/scripts/boulder-local.sh inspect --cwd <repo> --json
```

`bunx boulder-oss-cli` 실패는 Boulder 자체 실패가 아닐 수 있습니다. 로컬 Codex sandbox에서는 tempdir 권한 또는 registry 네트워크 제한 때문에 실패할 수 있으므로, `boulder` skill은 로컬 checkout 직접 호출을 기본값으로 둡니다.
