# boulder 사용설명서

`boulder`는 Codex에서 새 OSS repo를 초기 점검하고, 작업 계획과 검증 증거를 남기기 위한 Boulder skill 이름입니다.

## 가장 짧은 사용법

새 repo를 Codex에서 연 뒤 이렇게 요청하면 됩니다.

```text
boulder로 현재 repo 초기설정 해줘.
```

대상 repo가 현재 작업 디렉터리가 아니면 절대경로를 함께 줍니다.

```text
boulder로 /path/to/repo 초기설정 해줘.
```

## 권장 첫 실행 프롬프트

```text
boulder로 현재 repo 초기설정 해줘.
init -> quickstart -> inspect -> doctor -> pipeline medium -> verify --dry-run -> export 순서로 진행하고,
생성/수정된 파일, 실패한 gate, 다음 할 일을 요약해줘.
```

## Codex가 내부에서 실행해야 하는 명령

Codex 로컬 환경에서는 `bunx`나 `npx` 대신 skill wrapper를 씁니다.

```bash
bash <codex-home>/skills/boulder/scripts/boulder-local.sh init --cwd /path/to/repo
bash <codex-home>/skills/boulder/scripts/boulder-local.sh quickstart --cwd /path/to/repo
bash <codex-home>/skills/boulder/scripts/boulder-local.sh inspect --cwd /path/to/repo --json
bash <codex-home>/skills/boulder/scripts/boulder-local.sh doctor --cwd /path/to/repo --json
bash <codex-home>/skills/boulder/scripts/boulder-local.sh pipeline --cwd /path/to/repo --friction medium --json
bash <codex-home>/skills/boulder/scripts/boulder-local.sh verify --cwd /path/to/repo --dry-run
bash <codex-home>/skills/boulder/scripts/boulder-local.sh export --cwd /path/to/repo
```

`init`은 기본 executor preference를 `boulder.yaml`에 설정합니다. planning은 `gajae-code`, execution은 `lazycodex`, mode는 둘 다 `detect-and-suggest`입니다. 다만 이것은 설치 완료를 뜻하지 않습니다. `quickstart`에서는 `executor-planning`, `executor-execution` 체크로 preference가 보이고, `doctor --json`에서는 로컬 Codex inventory에서 발견될 때만 `status: available`, 없으면 `status: configured-unverified`로 보여야 합니다.

단, 이것은 자동 실행이 아닙니다. GJC와 LazyCodex live command는 사용자가 명시적으로 승인할 때만 실행합니다.

`--cwd`는 항상 Boulder command 뒤에 둡니다.

## Friction 선택

- `low`: README, labels, 작은 문서 정리
- `medium`: 일반 기능 구현, 초기 repo 세팅, onboarding 보강
- `high`: release, CI, security, multi-repo, public OSS 제출 전 점검

## 초기설정이 만드는 결과

초기설정은 보통 다음을 확인하거나 생성합니다.

- repo 구조와 검증 명령 감지
- Boulder manifest/config
- GJC planning adapter preference
- LazyCodex execution adapter preference
- quickstart와 onboarding surface
- doctor 결과와 capability gap
- pipeline plan
- dry-run verification 결과
- export evidence package

## 안전한 요청 예시

```text
boulder로 이 repo를 외부 사용자가 반복해서 쓸 수 있는 OSS 수준인지 점검해줘.
release-check, replay-check, product-readiness, service-readiness를 실행하고 부족점을 우선순위로 정리해줘.
```

```text
boulder로 이 PR 작업을 시작하기 전에 pipeline high를 만들고, 실행 전 확인해야 할 gate를 정리해줘.
```

```text
boulder로 release 전 점검해줘. GitHub CI evidence, npm install smoke, changelog, tag/release 상태를 확인해줘.
```

## 안 잡힐 때

새로 설치한 skill은 현재 Codex 세션에 바로 로드되지 않을 수 있습니다. 이 경우 새 Codex 세션을 열거나 아래처럼 wrapper를 직접 호출합니다.

```bash
bash <codex-home>/skills/boulder/scripts/boulder-local.sh inspect --cwd /path/to/repo --json
```

`bunx boulder-oss-cli`가 Codex 안에서 실패해도 정상입니다. 로컬 Codex sandbox에서는 tempdir 권한이나 npm registry 네트워크 접근이 막힐 수 있으므로 `boulder` skill은 로컬 checkout을 직접 호출합니다.
