# Marketplace, Security, and i18n Readiness Audit

Status: historical proposal-only audit with current residual-risk notes
Date: 2026-07-07
Scope: current Boulder worktree, npm registry metadata, GitHub workflow status visible through `gh`

이 문서는 수정 전 제안서다. 아래 항목은 승인 없이 구현하지 않는다. Boulder는 현재 hosted web app이 아니라 Bun TypeScript CLI이므로 SSL/HTTPS, 로그인, 모바일 반응형 일부 항목은 제품 런타임 이슈가 아니라 공개 배포/문서/마켓플레이스 검증 항목으로 판정한다.

## Executive Summary

| Area | 문제 여부 | 위험도 | 결론 |
| --- | --- | --- | --- |
| Public marketplace 등록 | 부분 해결됨 | Medium | npm latest와 README는 `0.1.16` 기준이다. 현재 residual risk는 release evidence/product-readiness를 같은 경계에서 다시 기록해야 한다는 점이다. |
| SSL/HTTPS | 부분 있음 | Low | CLI 자체에는 TLS 표면이 없다. 다만 capability source URL은 GitHub HTTPS만 허용한다. 공개 docs/site를 만들면 별도 HTTPS 검증이 필요하다. |
| 로그인/권한 | 해당 없음/부분 있음 | Low-Medium | 사용자 로그인은 없다. 대신 external handoff는 approval code와 review receipt로 보호된다. |
| 보안 취약점 | 부분 있음 | Medium-High | raw workspace 차단은 강하지만 `verify` shell 실행, generated write hardening, handoff approval secret 수명/위치, capability source immutability, dependency scanning, workflow SHA pinning 갭이 있다. |
| SEO/GEO/AEO | 부분 있음 | Medium | package metadata는 보강됨. 남은 갭은 FAQ/use-case answer 구조와 별도 웹 landing 자산이다. |
| 모바일 반응형 | 해당 없음 | Low | CLI/Markdown 제품이라 모바일 UI 표면이 없다. 웹 landing을 만들 때만 반응형 기준이 필요하다. |
| 메모리 누수 | 큰 문제 없음/부분 있음 | Low-Medium | daemon은 없지만 `exec` output buffering과 대형 JSON/doc read는 큰 repo에서 memory spike가 가능하다. |
| 병목/성능 | 부분 있음 | Medium | `product-readiness` 재귀 스캔, capability inventory fallback walk, release-check git shell calls가 큰 repo/cache에서 병목이 될 수 있다. |
| 예외 처리 | 부분 있음 | Medium-High | FS helper가 missing과 broken을 함께 삼키는 경향이 있어 unreadable/corrupt state를 default/missing으로 오판할 수 있다. |
| 문서 국제화 | 있음 | Medium | 한국어 문서가 일부만 있고 README/SECURITY/CONTRIBUTING/ONBOARDING의 locale parity 정책이 없다. |

## 확인 근거 요약

- `package.json` version은 `0.1.16`: `package.json:3`.
- npm registry는 `boulder-oss-cli@latest = 0.1.16`: `npm view boulder-oss-cli version dist-tags --json`.
- README는 `0.1.16` published package와 `@latest` 설치 예시를 사용한다.
- release evidence와 product-readiness 산출물은 같은 `0.1.16` 경계에서 재검증되어야 한다.
- `bun bin/boulder.ts release-check --json`과 `bun bin/boulder.ts product-readiness --json` 결과가 현재 공개 제출 상태의 source of truth다.
- GitHub Actions의 latest main CI/Security run은 성공: `gh run list --repo min9lin9/boulder --workflow CI --limit 5`, `gh run list --repo min9lin9/boulder --workflow Security --limit 5`.
- handoff packet은 raw workspace content 제외와 approval required를 강제: `src/handoff-packet.ts:84-91`, `src/handoff-packet.ts:133-145`, `src/handoff-packet.ts:154-185`.
- handoff review receipt는 HMAC + packet digest + approval digest를 사용: `src/handoff-paths.ts:47-62`, `src/handoff-paths.ts:107-123`.
- protected handoff path는 absolute path, traversal, `.env`, `secrets`, `vendor`, `node_modules`, `dist`를 차단: `src/handoff-path-policy.ts:22-35`.
- capability source는 GitHub HTTPS canonical URL만 허용하고 credentials/query/hash/port/trailing slash를 거부: `src/capability-source.ts:142-155`.
- CodeQL workflow는 존재하고 JS/TS를 분석: `.github/workflows/security.yml:1-32`.
- Bun package scanner는 미설정: `bun pm scan --json` 결과 `no security scanner configured`.
- GitHub Actions는 mutable tags를 사용한다: `.github/workflows/ci.yml:18`, `.github/workflows/ci.yml:23`, `.github/workflows/security.yml:21`, `.github/workflows/security.yml:24`, `.github/workflows/security.yml:29`, `.github/workflows/security.yml:32`.
- generic generated-write helper는 handoff의 atomic no-follow writer보다 약하다: `src/fs.ts:37-50`, `src/handoff-paths.ts:211-229`.
- `verify`는 manifest command string을 shell로 실행한다: `src/verify.ts:13-30`, `src/verify.ts:76-85`.

## 1. Public Marketplace 등록

### 문제 여부

있음.

### 위험도

Medium. stale README/version claim은 해결되었고, 남은 위험은 release evidence/product-readiness 산출물 갱신 전까지 current ready를 주장하면 안 된다는 점이다.

### 확인 근거

- `package.json:3`은 `0.1.16`.
- npm registry는 latest `0.1.16`.
- `README.md`는 current published package를 `0.1.16`으로 표시하고 CLI 예시는 `@latest`를 사용한다.
- `package.json:3`은 `0.1.16`.
- release evidence와 product-readiness는 현재 명령 산출물로 다시 확인해야 한다.
- `package.json`에는 `repository`, `homepage`, `bugs` 메타필드가 있다.

### 재현 방법

```bash
npm view boulder-oss-cli version dist-tags --json
rg -n "0\.1\.16|Current published package|bunx boulder-oss-cli" README.md package.json docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json docs/PRODUCT_READINESS.md
bun bin/boulder.ts release-check --json
bun bin/boulder.ts product-readiness --json
nl -ba package.json | sed -n '1,80p'
```

### 수정 방법

승인 후 별도 브랜치에서 다음만 고친다.

- release evidence와 product-readiness 산출물을 `0.1.16` evidence로 갱신한다.
- `docs/PRODUCT_READINESS.md`를 수동 green 상태로 바꾸지 말고 `bun bin/boulder.ts product-readiness` 산출물로 맞춘다.

### 백업/롤백

- 백업: 작업 전 현재 branch와 diff를 로컬 evidence workspace에 저장한다.
- 롤백: `git restore README.md package.json docs/CASE_STUDIES/evidence/release-workflow/install-smoke.txt docs/CASE_STUDIES/evidence/release-workflow/release-manifest.json docs/PRODUCT_READINESS.md`.

### 체크리스트

- [ ] `npm view boulder-oss-cli version dist-tags --json` latest가 문서와 일치한다.
- [ ] `bun bin/boulder.ts release-check --json` status가 현재 release evidence와 일치한다.
- [ ] `bun bin/boulder.ts product-readiness --json` status가 현재 공개 제출 상태와 일치한다.
- [ ] README 첫 화면, 설치 예시, release evidence, package metadata가 같은 버전을 가리킨다.
- [ ] package metadata에 repository/homepage/bugs가 표시된다.

## 2. SSL/HTTPS

### 문제 여부

제품 런타임 기준 해당 없음. 공개 source/import policy 기준은 양호. 공개 docs/site를 만들면 별도 항목이 생긴다.

### 위험도

Low.

### 확인 근거

- Boulder는 local Bun CLI이고 hosted HTTP server가 아니다.
- capability source parser는 GitHub source를 HTTPS와 `github.com/<owner>/<repo>` 형태로 제한한다: `src/capability-source.ts:142-155`.
- README와 quickstart는 GitHub capability URL을 HTTPS로 예시한다: `README.md:45-48`, `README.md:72`.

### 재현 방법

```bash
rg -n "http://|https://|parseGitHubSource|protocol|hostname" src README.md docs
bun test test/capability-source.test.ts test/capability-source-forgery.test.ts
```

### 수정 방법

현재 CLI에는 TLS 코드 수정이 필요 없다. 승인 후 공개 docs/landing/site를 추가한다면 다음을 추가한다.

- 배포 채널별 HTTPS 강제 확인 항목.
- docs URL canonicalization.
- sitemap/robots/OG metadata가 HTTPS canonical URL을 가리키는지 확인.

### 백업/롤백

- 웹/문서 배포 자산을 추가하는 경우만 별도 커밋으로 분리한다.
- 롤백: 신규 web/docs metadata 파일만 `git restore` 또는 해당 커밋 revert.

### 체크리스트

- [ ] CLI source import는 HTTPS GitHub URL만 허용한다.
- [ ] HTTP server나 cookie/session 코드가 없음을 유지한다.
- [ ] 향후 public site 도입 시 HTTPS redirect, canonical URL, HSTS 적용 여부를 배포 환경에서 검증한다.

## 3. 로그인·권한

### 문제 여부

일반 사용자 로그인은 해당 없음. External handoff 승인 흐름은 존재하며 대체로 양호하다.

### 위험도

Low-Medium.

### 확인 근거

- auth/session/login endpoint나 cookie 코드가 없다.
- `handoff send`는 `--approve-external` 없이는 blocked: `src/handoff-packet.ts:140-145`.
- packet 검토 후 HMAC 기반 approval code가 필요하다: `src/handoff-paths.ts:47-62`, `src/handoff-command.ts:104-132`.
- raw workspace content는 approval이 있어도 forbidden: `src/handoff-packet.ts:133-138`, `src/handoff-packet.ts:164-183`.

### 재현 방법

```bash
rg -n "login|auth|session|cookie|approve-external|approval-code|review-secret|raw_workspace" src test
bun test test/handoff-cli-e2e.test.ts test/handoff-safety-e2e.test.ts
```

### 수정 방법

승인 후 문서 보강만 우선한다.

- README/SECURITY에 “Boulder has no hosted login surface”를 명시.
- external handoff approval model과 operator responsibility를 한 섹션으로 요약.
- `handoff send` 실패/승인 예시를 최신화.

### 백업/롤백

- 문서 변경만 별도 커밋.
- 롤백: `git restore README.md SECURITY.md docs/TRUST_SUPPORT_SECURITY.md docs/HANDOFF_VALIDATION.md`.

### 체크리스트

- [ ] 로그인/세션/cookie 표면 없음이 문서화된다.
- [ ] external handoff는 packet review + approval code 없이는 실행되지 않는다.
- [ ] raw workspace content forbidden 테스트가 통과한다.

## 4. 보안 취약점

### 문제 여부

부분 있음.

### 위험도

Medium.

### 확인 근거

양호한 부분:

- protected handoff paths: `src/handoff-path-policy.ts:22-35`.
- symlink/hardlink 방어: `src/handoff-paths.ts:34-44`, `src/handoff-paths.ts:195-229`.
- source URL canonicalization: `src/capability-source.ts:142-155`.
- CodeQL workflow 존재: `.github/workflows/security.yml:1-32`.
- root security policy 존재: `SECURITY.md:1-17`, `docs/TRUST_SUPPORT_SECURITY.md:23-34`.

갭:

- `bun pm scan`은 scanner 미설정으로 실행 불가.
- `verify`는 `boulder.yaml`의 verification command를 `child_process.exec`로 실행한다: `src/verify.ts:23-30`, `src/verify.ts:76-85`. 이것은 repo-local maintainer-declared command라는 전제에서는 의도된 동작이지만, 공개 marketplace에는 신뢰 경계가 더 분명해야 한다.
- package runtime deps는 거의 없지만 security scanner 결과가 evidence로 남지 않는다.
- generic generated-write는 path validation 후 plain `writeFile`을 호출한다: `src/fs.ts:37-50`. handoff writer는 `O_NOFOLLOW`, temp file, `0o600`, rename, post-write `lstat`를 쓴다: `src/handoff-paths.ts:211-229`. generated docs/capability manifest write도 같은 hardened writer로 통일할 여지가 있다.
- handoff approval secret은 workspace `.boulder/review-secret`에 persist된다: `src/handoff-paths.ts:182-192`. local workspace를 읽을 수 있는 프로세스가 approval material을 만들 수 있으므로 one-time/short-lived 또는 OS-protected storage 검토가 필요하다.
- capability source write는 GitHub URL shape를 검증하지만 immutable ref나 signed tag를 요구하지 않는다: `src/capability-source.ts:142-155`, `src/capability-command.ts`. typo-squat 또는 later-compromised repo가 `configured-unverified` 후보로 남을 수 있다.
- GitHub Actions는 mutable tag를 사용한다. public marketplace supply-chain posture에는 full SHA pinning과 update policy가 더 낫다.
- npm publish는 manual 2FA 중심이며 provenance/attestation claim은 없다: `docs/RELEASE_WORKFLOW.md`, `docs/TRUST_SUPPORT_SECURITY.md:67`.

### 재현 방법

```bash
bun pm scan --json
rg -n "exec\\(|spawn\\(|eval\\(|new Function|approve-external|raw_workspace|secrets|\\.env" src bin .github SECURITY.md docs/TRUST_SUPPORT_SECURITY.md
rg -n "(actions/checkout@|setup-bun@|codeql-action/)" .github/workflows
nl -ba src/fs.ts | sed -n '37,89p'
nl -ba src/handoff-paths.ts | sed -n '47,62p;182,229p'
bun test test/handoff-packet.test.ts test/handoff-cli-e2e.test.ts test/handoff-safety-e2e.test.ts test/capability-source-forgery.test.ts
```

### 수정 방법

승인 후 작은 순서로 진행한다.

1. `verify` 문서에 “executes maintainer-declared local commands from trusted repo config” 경계를 명시한다.
2. `verify` non-dry-run에는 신뢰 경고 또는 명시적 `--allow-shell-verify`/`--yes-trusted-repo` 같은 승인 플래그를 검토한다.
3. 가능하면 free-form shell string 대신 argv array + `spawn`/`execFile` 경로로 이동한다.
4. generated write/capability manifest write를 handoff와 같은 hardened no-follow atomic writer로 통일한다.
5. handoff approval secret은 workspace 밖 OS-protected storage, one-time expiry, approval code 출력 최소화를 검토한다.
6. capability source `--write`에는 commit SHA/signed tag 또는 owner/repo allowlist confirmation을 요구하는 옵션을 검토한다.
7. `bun pm scan`을 쓰려면 scanner package/정책을 선택하거나, npm/GitHub Dependabot/CodeQL evidence를 release checklist에 명시한다.
8. GitHub Actions를 full commit SHA로 pin하고 update policy를 문서화한다.
9. package provenance/trusted publishing 또는 CI-generated checksum/attestation을 release workflow에 추가할지 결정한다.
10. `package.json`/GitHub security settings checklist에 secret scanning, push protection, Dependabot 상태를 외부 확인 항목으로 추가한다.

### 백업/롤백

- 문서-only 변경은 `git restore docs/VERIFICATION_GATES.md docs/TRUST_SUPPORT_SECURITY.md SECURITY.md README.md`.
- scanner config를 추가할 경우 `bunfig.toml`/lockfile 변경을 별도 커밋으로 분리하고, 실패 시 `git restore bunfig.toml bun.lock`.
- write hardening 승인 시 `src/fs.ts`, `src/capability-source.ts`, 관련 tests만 별도 커밋으로 분리한다. 실패 시 `git restore src/fs.ts src/capability-source.ts test/*`.
- handoff approval 변경 승인 시 `.boulder` fixture와 handoff tests만 별도 커밋으로 분리한다. 실패 시 `git restore src/handoff-paths.ts src/handoff-command.ts test/handoff-*`.
- GitHub Actions SHA pinning 실패 시 `git restore .github/workflows/ci.yml .github/workflows/security.yml`.

### 체크리스트

- [ ] CodeQL run success URL이 release evidence에 남는다.
- [ ] dependency scanner 또는 대체 security evidence가 명시된다.
- [ ] `verify` command execution trust boundary가 README/SECURITY/docs에 보인다.
- [ ] handoff/capability safety tests가 통과한다.
- [ ] generic generated writes가 symlink/hardlink/TOCTOU에 fail-closed 한다.
- [ ] handoff approval material은 재사용/장기 workspace secret 의존을 줄인다.
- [ ] capability source 후보는 immutable ref 또는 명시 trust confirmation을 남긴다.
- [ ] GitHub Actions are pinned by SHA or an explicit exception is documented.
- [ ] npm provenance/trusted publishing decision is documented.

## 5. SEO/GEO/AEO

### 문제 여부

있음.

### 위험도

Medium.

### 확인 근거

- npm metadata fields `repository`, `homepage`, `bugs`는 현재 `package.json`에 있음.
- `.html`, `.css`, `robots.txt`, `sitemap.xml`, favicon/OG image asset이 없음.
- FAQ/use-case answer index가 명확하지 않음.
- README는 제품 목적과 명령을 설명하지만, 검색/AI answer용 질문형 entry가 부족하다.

### 재현 방법

```bash
rg --files -g '*.html' -g '*.css'
rg --files -g 'sitemap.xml' -g 'robots.txt' -g 'favicon*' -g '*.png' -g '*.jpg' -g '*.webp' -g '*.svg'
rg -n "^#\\s*FAQ|Frequently Asked Questions|## .*Questions|## .*Troubleshoot" README.md docs/*.md docs/contributing/*.md
nl -ba package.json | sed -n '1,80p'
```

### 수정 방법

승인 후 최소 변경부터 적용한다.

- npm metadata는 현재 유지하고, README/FAQ answer 구조를 보강한다.
- README 상단에 “What is Boulder?”, “Who is it for?”, “How do I verify it?” 같은 짧은 answer blocks 추가.
- `docs/FAQ.md` 또는 README FAQ를 추가하고 핵심 질문 8-10개를 evidence link와 함께 정리.
- 별도 public website를 만들 때만 sitemap/robots/OG/JSON-LD를 추가한다.

### 백업/롤백

- package metadata와 docs FAQ를 분리 커밋.
- 롤백: `git restore package.json README.md docs/FAQ.md`.

### 체크리스트

- [ ] npm package page에 repository/homepage/issues가 표시된다.
- [ ] README 첫 화면에서 제품 대상, 문제, 설치, 검증 경로가 30초 안에 읽힌다.
- [ ] FAQ 항목마다 source/evidence 링크가 있다.
- [ ] public site가 생기면 sitemap/robots/OG/JSON-LD를 별도 QA한다.

## 6. 모바일 반응형

### 문제 여부

현재 제품 표면에는 해당 없음.

### 위험도

Low.

### 확인 근거

- web frontend framework, HTML/CSS/TSX/JSX/Vue 파일이 없다.
- 제품은 CLI와 Markdown docs 중심이다.

### 재현 방법

```bash
rg --files -g '*.html' -g '*.css' -g '*.tsx' -g '*.jsx' -g '*.vue'
rg -n "\"dependencies\"" package.json
```

### 수정 방법

현재는 수정하지 않는다. 승인 후 public landing/docs site를 만들 때만 다음 기준을 추가한다.

- mobile viewport QA.
- no horizontal overflow.
- tap target size.
- readable code blocks on mobile.

### 백업/롤백

- 웹 자산 도입 커밋을 runtime CLI 변경과 분리.
- 롤백: 신규 site directory 또는 static assets만 revert.

### 체크리스트

- [ ] 현재 CLI-only라 mobile UI surface 없음이 release/readiness 문서에 명시된다.
- [ ] future public site PR template에 mobile visual QA 항목이 생긴다.

## 7. 메모리 누수

### 문제 여부

큰 문제 없음. 규모가 큰 repo에서는 bounded read/scan 개선 여지가 있다.

### 위험도

Low.

### 확인 근거

- Boulder는 long-running daemon이 아니라 one-shot CLI다.
- file handle cleanup은 handoff/skill-proposal path에서 `finally`로 닫는다: `src/handoff-paths.ts:195-229`, `src/skill-proposal.ts:73-83`, `src/skill-proposal.ts:169-188`.
- 여러 모듈이 JSON/문서를 전체 `readFile`로 읽는다. 현재 repo 규모는 약 19MB/227 files로 작다.
- `verify`와 test helper는 `exec`가 stdout/stderr를 메모리에 buffer한다: `src/verify.ts:76-85`, `test/helpers/cli.ts`.

### 재현 방법

```bash
du -sh . src docs fixtures test skills examples
find src test docs skills examples fixtures -type f | wc -l
rg -n "readFile|readdir|lstat|open\\(" src/*.ts
rg -n "\\bexec\\(" src/verify.ts test/helpers/cli.ts
```

### 수정 방법

승인 후 필요할 때만 한다.

- readiness/tree scan에 max file size, skipped directories, timeout 또는 abort signal을 추가한다.
- 큰 evidence file은 streaming 또는 bounded preview로 읽도록 제한한다.
- command-level timeout은 이미 일부 exec에 있으므로 문서화한다.
- `verify`는 `exec` 대신 `spawn`/`execFile` streaming capture 또는 retained output cap을 검토한다.

### 백업/롤백

- perf/resource guard는 behavior 영향이 있으므로 focused tests와 함께 별도 커밋.
- 롤백: 변경 파일 `src/product-readiness.ts`, `src/replay-check.ts`, `src/service-readiness.ts` 등만 restore.

### 체크리스트

- [ ] 큰 fixture/evidence 파일에서 CLI가 memory spike 없이 종료한다.
- [ ] 파일 스캔은 `.git`, `node_modules`, `.bun` 같은 대형 디렉터리를 건너뛴다.
- [ ] 새 limit은 사용자에게 명확한 warning/next step을 준다.
- [ ] verification command output이 커도 `maxBuffer` 실패나 과도한 memory retention이 없다.

## 8. 병목 현상 / 성능 개선

### 문제 여부

부분 있음.

### 위험도

Low-Medium.

### 확인 근거

- `product-readiness`는 duplicate copy artifact 확인을 위해 repo tree를 재귀 순회한다: `src/product-readiness.ts:156-187`.
- `release-check`는 여러 file content check를 순차 실행한다: `src/release-check.ts:19-31`.
- `verify`는 verification command를 순차 실행한다: `src/verify.ts:12-43`.
- `release-check`는 여러 git command를 shell exec로 순차 호출한다: `src/release-check.ts:124-141`, `src/release-check.ts:215-240`, `src/release-check.ts:278-288`.
- fallback capability inventory discovery는 `.codex` 하위 skill files를 재귀 탐색한다. 큰 plugin cache 또는 symlinked tree에서는 느려질 수 있다: `src/capability-inventory.ts`.
- 현재 repo에서는 실측상 명령이 빠르게 끝나지만, 큰 대상 repo에서는 병렬화/skip 기준이 필요할 수 있다.

### 재현 방법

```bash
time bun bin/boulder.ts release-check --json
time bun bin/boulder.ts product-readiness --json
rg -n "for \\(|await .*readFile|await .*readdir|Promise\\.all" src/product-readiness.ts src/release-check.ts src/verify.ts src/service-readiness.ts src/replay-check.ts
rg -n "discoverCapabilityInventory|findSkillFiles|readdir\\(" src/capability-inventory.ts
```

### 수정 방법

승인 후 우선순위:

1. Independent content checks는 `Promise.all`로 병렬화한다.
2. tree scan은 excluded dirs를 늘리고 max depth/size guard를 추가한다.
3. release-check git calls는 `execFile("git", argv)` 또는 `Bun.spawn`으로 shell을 제거하고 HEAD/tag lookup을 한 run 안에서 cache한다.
4. capability inventory fallback discovery는 symlink traversal 방지, visited-set, skip list, max depth를 추가한다.
5. `verify`는 의도적으로 순차 실행할 수 있으므로 병렬화보다 timeout/error summary 개선을 우선한다.

### 백업/롤백

- 성능 변경 전 baseline transcript를 로컬 evidence workspace에 저장한다.
- 롤백: `git restore src/product-readiness.ts src/release-check.ts src/service-readiness.ts src/replay-check.ts`.

### 체크리스트

- [ ] baseline vs after timings를 같은 command로 비교한다.
- [ ] ready/blocked 결과가 동일하게 유지된다.
- [ ] 대형 repo에서 scan skipped reason이 출력된다.
- [ ] release-check의 git 호출은 shell-free이고 반복 lookup을 cache한다.
- [ ] capability discovery가 large `.codex` cache에서도 bounded time 안에 끝난다.

## 9. 예외 처리

### 문제 여부

부분 있음.

### 위험도

Medium.

### 확인 근거

- CLI top-level은 `UnsafeGeneratedWritePathError`만 특별 처리하고 나머지는 throw한다: `src/cli.ts:29-38`.
- `release-check`의 JSON/IO 실패는 invalid/missing evidence로 잘 요약된다: `src/release-check.ts:143-164`.
- 여러 command module은 domain error를 `ERROR <code>`로 출력한다.
- 일부 catch는 빈 문자열/false로 축약되어 operator가 원인과 remediation을 바로 알기 어려울 수 있다: `src/product-readiness.ts:190-195`, `src/capability-source.ts:107-124`.
- core FS helpers가 missing과 broken을 모두 absence처럼 처리한다: `src/fs.ts:4-18`. `manifest`는 falsy read 결과를 default manifest로 대체한다.
- generated-write safety validation은 일부 `lstat` 실패를 fail-closed하지 못할 수 있다: `src/fs.ts:54-89`.
- JSON loaders는 size guard 없이 전체 파일을 읽고 parse한다: `src/capability-source.ts:114-119`, `src/capability-source.ts:188-207`, `src/benchmark.ts`.

### 재현 방법

```bash
bun bin/boulder.ts unknown-command
bun bin/boulder.ts capability import --from 'https://github.com/a/b?x=1' --dry-run
bun bin/boulder.ts release-check --json
rg -n "catch \\{|throw new|console\\.error|process\\.exitCode|JSON\\.parse" src/*.ts
rg -n "readText\\(|exists\\(|defaultManifest|assertSafeGeneratedRoot|assertSafeGeneratedPath" src/fs.ts src/manifest.ts
```

### 수정 방법

승인 후:

- Top-level known domain errors를 code-bearing errors로 통일한다.
- read failure를 삼키는 곳은 report issue에 path/reason을 남긴다.
- JSON parse failure는 invalid JSON vs unsafe path vs missing path를 구분한다.
- `exists`/`readText`는 `ENOENT`만 absence로 보고 `EACCES`, `EMFILE`, `EIO` 등은 typed error로 올린다.
- generated write path validation은 not-yet-created descendant의 `ENOENT`만 허용하고 다른 `lstat` 실패는 중단한다.
- JSON artifact loader는 `lstat` size ceiling을 먼저 확인하고 file-too-large/malformed를 구분한다.

### 백업/롤백

- error-shape 변경은 CLI tests와 함께 별도 커밋.
- 롤백: touched command modules와 tests만 restore.
- FS helper 변경은 영향 범위가 넓으므로 `src/fs.ts`와 직접 caller tests를 한 커밋에 묶고 실패 시 `git restore src/fs.ts src/manifest.ts test/*`.

### 체크리스트

- [ ] malformed source URL, invalid JSON, unsafe path, missing file이 서로 다른 error code를 낸다.
- [ ] 기존 success output은 바뀌지 않는다.
- [ ] `bun test`와 focused e2e가 통과한다.
- [ ] unreadable manifest/config가 silently default로 바뀌지 않는다.
- [ ] generated write safety check는 non-ENOENT FS error에서 fail-closed 한다.
- [ ] oversized local JSON artifact는 memory churn 없이 typed issue로 끝난다.

## 10. 문서 국제화

### 문제 여부

있음.

### 위험도

Medium.

### 확인 근거

- `.ko.md` 문서는 일부만 존재한다.
- README는 한국어 사용 안내서 하나만 연결한다: `README.md:145`.
- 핵심 공개 문서 `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/ONBOARDING.md`, `docs/CONTRIBUTOR_START_HERE.md`에는 locale parity 정책이 없다.

### 재현 방법

```bash
rg --files docs | rg '\.ko\.md$'
rg -n "locale|i18n|translation|한국어|Korean|\\.ko\\.md" README.md docs/*.md docs/contributing/*.md
```

### 수정 방법

승인 후:

- `docs/I18N_READINESS.md` 또는 `docs/I18N_POLICY.md`를 추가한다.
- locale coverage matrix를 만든다: README, ONBOARDING, SECURITY, CONTRIBUTING, quickstart, FAQ.
- 한국어 문서는 `*.ko.md` naming으로 통일하고 README에서 명확히 링크한다.
- 번역 대상이 아닌 session/local planning docs는 package 제외 규칙과 함께 명시한다.

### 백업/롤백

- locale policy와 번역 문서는 별도 커밋.
- 롤백: `git restore docs/I18N_POLICY.md docs/*.ko.md README.md`.

### 체크리스트

- [ ] 핵심 public docs별 locale status가 있다.
- [ ] stale 번역 감지 방식이 있다.
- [ ] README에서 한국어/영어 entrypoint가 서로 연결된다.

## 우선순위 수정안

| Priority | 승인 대상 | 이유 | 예상 변경 |
| --- | --- | --- | --- |
| P0 | release evidence/product-readiness parity | 현재 worktree 기준 readiness status의 직접 근거 | install-smoke, release-manifest, PRODUCT_READINESS |
| P1 | package metadata 유지 검증 | npm marketplace 신뢰/탐색성 회귀 방지 | package.json, release metadata tests |
| P1 | write-path hardening | generic generated writes/capability manifests를 handoff 수준으로 보호 | src/fs.ts, src/capability-source.ts, tests |
| P1 | security evidence gap 문서화 | verify command trust boundary와 scanner 미설정 명확화 | SECURITY, TRUST_SUPPORT_SECURITY, VERIFICATION_GATES |
| P1 | verify trust boundary | untrusted repo에서 manifest command 실행 위험 축소 | src/verify.ts, CLI docs, tests |
| P2 | GitHub Actions pinning/provenance | supply-chain posture 보강 | .github/workflows, RELEASE_WORKFLOW |
| P2 | FAQ/AEO + i18n policy | public discovery와 국제화 기반 | README 또는 docs/FAQ.md, docs/I18N_POLICY.md |
| P2 | performance/error-handling guard | 큰 repo/오류 진단성 개선 | src/product-readiness.ts, src/release-check.ts, 관련 tests |
| P3 | public web/SEO/mobile surface | CLI-only 범위를 넘어선 별도 제품 표면 | 신규 web/docs site 자산 |

## 승인 후 공통 백업/롤백 절차

1. 작업 전 현재 상태 저장:

```bash
git status --short --branch
git diff --stat
git status --short --branch
git diff --stat
```

2. 승인 항목별 브랜치/커밋 분리:

```bash
git switch -c codex/<approved-scope>
```

3. 변경 후 검증:

```bash
bunx tsc --noEmit
bun test <focused tests>
bun bin/boulder.ts release-check --json
bun bin/boulder.ts product-readiness --json
```

4. 실패 시 롤백:

```bash
git restore <approved-files>
```

이미 커밋된 뒤라면:

```bash
git revert <commit>
```

## 이번 감사에서 수정하지 않은 것

- runtime code 수정 없음.
- package metadata는 이번 remediation에서 이미 보강됨.
- release evidence 갱신 없음.
- docs i18n/FAQ 생성 없음.
- security scanner config 추가 없음.

사용자 승인 후 항목별로 백업/롤백 evidence를 남기고 구현한다.
