# Manual QA Report

Status: PASS
Date: 2026-06-06
Worktree: `/Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder-ulw-slop`

## Scenario A: Happy Path

Channel: tmux
Session: `ulw-qa-happy`

Invocation:

```bash
cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder-ulw-slop
tmux new-session -d -s ulw-qa-happy "
tmp=\$(mktemp -d)
trap 'code=\$?; echo qa-exit:\$code; rm -rf \"\$tmp\"; echo cleanup:removed:\$tmp; tmux wait-for -S ulw-qa-happy-done; sleep 30' EXIT
bun bin/boulder.ts init --cwd \"\$tmp\"
bun bin/boulder.ts validate --cwd \"\$tmp\"
bun bin/boulder.ts scorecard --cwd \"\$tmp\" --json
bun bin/boulder.ts export --cwd \"\$tmp\" --force
"
tmux wait-for ulw-qa-happy-done
tmux capture-pane -pt ulw-qa-happy -S -200
tmux kill-session -t ulw-qa-happy
```

PASS evidence:

- Transcript contained `Boulder initialized`.
- Transcript contained scorecard JSON with `"rating": "ready"`.
- Transcript contained `Boulder export complete`.
- Transcript ended with `qa-exit:0`.

Cleanup receipt:

- Removed temp target: `/var/folders/3d/60yckf352vn0z4nh5p1v_bn40000gn/T/tmp.Yv1SKG5qrO`
- `cleanup:tmux-session-gone`

## Scenario B: Unsafe Provider Policy

Channel: tmux
Session: `ulw-qa-unsafe-provider`

Invocation:

```bash
cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder-ulw-slop
tmux new-session -d -s ulw-qa-unsafe-provider "
tmp=\$(mktemp -d)
trap 'code=\$?; echo qa-exit:\$code; rm -rf \"\$tmp\"; echo cleanup:removed:\$tmp; tmux wait-for -S ulw-qa-unsafe-provider-done; sleep 30' EXIT
bun bin/boulder.ts init --cwd \"\$tmp\"
cp fixtures/provider-policies/external-without-approval/boulder.yaml \"\$tmp/boulder.yaml\"
bun bin/boulder.ts validate --cwd \"\$tmp\"
echo validate-exit:\$?
"
tmux wait-for ulw-qa-unsafe-provider-done
tmux capture-pane -pt ulw-qa-unsafe-provider -S -200
tmux kill-session -t ulw-qa-unsafe-provider
```

PASS evidence:

- Transcript contained `ERROR providers.approvalRequired: External providers require approval gating.`
- Transcript contained `validate-exit:1`.
- Transcript ended with `qa-exit:0`.

Cleanup receipt:

- Removed temp target: `/var/folders/3d/60yckf352vn0z4nh5p1v_bn40000gn/T/tmp.yDctODWIpZ`
- `cleanup:tmux-session-gone`

## Scenario C: Release Plan And Export

Channel: tmux
Session: `ulw-qa-release-export`

Invocation:

```bash
cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder-ulw-slop
tmux new-session -d -s ulw-qa-release-export "
tmp=\$(mktemp -d)
trap 'code=\$?; echo qa-exit:\$code; rm -rf \"\$tmp\"; echo cleanup:removed:\$tmp; tmux wait-for -S ulw-qa-release-export-done; sleep 30' EXIT
bun bin/boulder.ts init --cwd \"\$tmp\"
bun bin/boulder.ts release-plan --json
bun bin/boulder.ts export --cwd \"\$tmp\" --force
"
tmux wait-for ulw-qa-release-export-done
tmux capture-pane -pt ulw-qa-release-export -S -200
tmux kill-session -t ulw-qa-release-export
```

PASS evidence:

- Transcript contained release-plan JSON with `"status": "ready"`.
- Transcript contained `Boulder export complete`.
- Transcript ended with `qa-exit:0`.

Cleanup receipt:

- Removed temp target: `/var/folders/3d/60yckf352vn0z4nh5p1v_bn40000gn/T/tmp.hAYnDwgPxU`
- `cleanup:tmux-session-gone`

## Scenario D: LOC And CI

Channel: tmux
Session: `ulw-qa-lines`

Invocation:

```bash
cd /Users/burt/Documents/Codex/2026-06-02/files-mentioned-by-the-user-codex/work/boulder-ulw-slop
tmux new-session -d -s ulw-qa-lines "
log=\$(mktemp -t boulder-ulw-lines-ci.XXXXXX)
trap 'code=\$?; echo qa-exit:\$code; rm -f \"\$log\"; echo cleanup:removed-log:\$log; tmux wait-for -S ulw-qa-lines-done; sleep 30' EXIT
echo baseline-src-cli:145
echo baseline-src-scorecard:216
echo baseline-src-globals:43
node -e 'const fs=require(\"fs\"); for (const f of [\"src/cli.ts\",\"src/scorecard.ts\",\"src/globals.d.ts\"]){const s=fs.readFileSync(f,\"utf8\"); const loc=s.split(/\\n/).filter(l=>l.trim()&&!/^\\s*(\\/\\/|#)/.test(l)).length; console.log(f+\":\"+loc)}'
bun run ci >\"\$log\" 2>&1
code=\$?
tail -n 8 \"\$log\"
echo ci-exit:\$code
"
tmux wait-for ulw-qa-lines-done
tmux capture-pane -pt ulw-qa-lines -S -200
tmux kill-session -t ulw-qa-lines
```

PASS evidence:

- Transcript contained `baseline-src-cli:145`.
- Transcript contained `baseline-src-scorecard:216`.
- Transcript contained `baseline-src-globals:43`.
- Transcript contained `src/cli.ts:142`.
- Transcript contained `src/scorecard.ts:213`.
- Transcript contained `src/globals.d.ts:44`.
- Transcript contained `ci-exit:0`.
- Transcript ended with `qa-exit:0`.

Cleanup receipt:

- Removed temp CI log: `/var/folders/3d/60yckf352vn0z4nh5p1v_bn40000gn/T/boulder-ulw-lines-ci.XXXXXX.DBH8PRTpQO`
- `cleanup:tmux-session-gone`
