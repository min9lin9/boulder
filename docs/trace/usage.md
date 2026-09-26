# Trace operations and data hygiene

## Command availability and evidence flow

Use Bun >= 1.3.14. In a source checkout, replace `boulder` below with
`bun bin/boulder.ts`. `--cwd` selects the repository whose `.boulder/` is used.

The intended flow is **doctor -> collect -> verify -> serve -> link -> routine
evidence**. Every stage of that flow is delivered in this revision:
`trace doctor`, `trace collect`, `trace verify --strict`, `trace serve`,
`trace link`, `trace unlock`, `routine capture`, and `routine evidence add`.
Each gate is real but each still verifies only its own contract; do not treat
one command's success as certification of the whole pipeline.

1. **Doctor: admit the source before collecting.**

   ```sh
   boulder trace doctor --source openclaw-local --db-path /absolute/path/openclaw-agent.sqlite --cwd /path/to/repo --json
   ```

   This opens the explicitly selected database read-only and reports the schema,
   payload encodings, observed timing/usage/linking fields, limits, and an
   `admit`/`refuse` verdict. Admission is not proof that every row normalizes.
   The current payload profile is synthetic fixture-backed, not certification
   of an installed OpenClaw version; see [admission](openclaw-admission.md).
   Use a consistent SQLite backup or a local read-only source; do not copy only
   the main database of a live WAL database and assume it is complete.

2. **Collect: preview, then explicitly write one bounded session snapshot.**

   ```sh
   boulder trace collect --source openclaw-local --db-path /absolute/path/openclaw-agent.sqlite --session session-id --once --dry-run --cwd /path/to/repo --json
   boulder trace collect --source openclaw-local --db-path /absolute/path/openclaw-agent.sqlite --session session-id --once --write --cwd /path/to/repo --json
   ```

   Choose exactly one of `--dry-run` and `--write`; only `--once` is supported.
   The first write registers a source UUID in `trace-state/source-config.json`;
   later collections can omit `--db-path`. Moving the same source should retain
   that UUID and update its path, not silently create a new identity. Agent
   identity is currently reported as `unavailable`, not guessed from the path.

   Collection inventories the whole selected session, including revisions at
   unchanged row sequence numbers. Unchanged comparable inventory is a `no-op`;
   a changed observation gets a new snapshot ID, including an A -> B -> A
   change. Quarantined rows remain accounted for: `trace.quarantined` means
   incomplete/nonzero even when a snapshot was committed. Preview IDs are not
   durable evidence. Dry-run does not reserve space or enforce the commit budget.

3. **Verify: gate consumption on strict verification.**

   ```sh
   boulder trace verify --strict --cwd /path/to/repo --json
   ```

   This checks journal integrity (segment chain, digests, head), source
   coverage of committed snapshots, and telemetry fidelity, then reports a
   `pass`/`fail` verdict; `fail` exits nonzero. An empty journal reports an
   honest empty PASS, which does not establish source coverage or telemetry
   fidelity - the report says so.

4. **Serve: inspect verified evidence locally.**

   ```sh
   boulder trace serve --host 127.0.0.1 --port 4319 --cwd /path/to/repo
   ```

   This starts a read-only loopback UI over the published journal. Sessions pin
   to a head revision (`<sequence>:<digest>`); a stale or unknown pin answers
   HTTP 409 `refresh_required` and the UI refreshes only on an explicit click -
   no polling. Opening the UI is inspection, not collection or evidence
   certification.

5. **Link: pin reviewable evidence to a snapshot and event range.**

   ```sh
   boulder trace link --snapshot snapshot-id --from-event event-a --to-event event-b --run-id run-id --write --cwd /path/to/repo --json
   ```

   `--write` commits a content-addressed binding under
   `.boulder/trace-state/bindings/<binding_id>.json` and mints the matching
   evidence descriptor `.boulder/evidence/traces/<binding_id>.json` in the same
   lock. The descriptor is committable, unlike the journal. If the binding
   commits but the descriptor write fails, the command reports a named partial
   failure (`trace.evidence_descriptor_uncommitted`) instead of claiming
   success; retrying the same link command heals it because the binding dedupes
   to `no-op` while the descriptor is minted or reused. Endpoints are logical
   IDs or JSON source locators `["session-id",seq]` and the range is inclusive
   in snapshot order. Attach still authenticates descriptor integrity only;
   `retro weekly` resolves whether the backing binding exists.

6. **Routine evidence: retain reviewable references, not raw transcript bodies.**

   ```sh
   boulder routine capture --task 'Review build failures' --dry-run --cwd /path/to/repo --json
   boulder routine capture --task 'Review build failures' --write --cwd /path/to/repo --json
   ```

   ```sh
   boulder routine evidence add --task <task-slug> --ordinal 1 --descriptor-kind traces --descriptor-id <binding_id> [--note text] --cwd /path/to/repo --json
   ```

   Capture writes `.boulder/routines/<task-slug>.json`, preserving existing safe
   `evidenceRefs`. `routine evidence add` authenticates the named descriptor
   (schema, identity, canonical-content hash, path containment) and stores a
   `{kind, path, hash, note?}` reference on the artifact. Link's `traces`
   descriptors attach by binding id; other descriptor kinds work the same way.
   Routine capture, evidence attach, and trace collection share the same
   writer lock.

## Metadata-only policy and Git boundaries

The content policy is `boulder.trace.metadata-only.v1`. Collection persists
source/observation IDs, row locators, revisions/hashes, disposition counts,
coverage, quality flags, safe reason codes, and admitted normalized facts.
It does **not** persist message/prompt bodies, tool arguments, tool output, or
arbitrary optional metadata. Such content is decoded locally to validate and
fingerprint a row, not copied into the journal. Quarantine records contain
locators/revisions and bounded diagnostics, not the rejected payload.

Metadata is not anonymization: session IDs, model/tool names, timestamps, usage
bucket names/values, and source paths can still be sensitive. Review artifacts
before sharing. Usage remains source-reported, unknown-scope and non-additive;
do not add cache buckets to prompt tokens or relabel them as `gen_ai.*` totals.

The repository ignores `.boulder/traces/`, `.boulder/trace-state/`,
`.boulder/trace-cache/`, and `.boulder/**/writer.lock`. It does not blanket-ignore
`.boulder/`: JSON evidence under `.boulder/evidence/`, routines under
`.boulder/routines/`, and runs under `.boulder/runs/` remain committable.
No negation rules are needed with these scoped patterns. Other rules such as
`*.log` still apply; ignore rules do not untrack already tracked files or scrub
Git history. Do not force-add runtime artifacts.

```sh
git check-ignore -v .boulder/traces/x.jsonl .boulder/trace-state/head.json .boulder/trace-cache/x.json .boulder/runs/a/writer.lock
git check-ignore -v .boulder/evidence/traces/b.json .boulder/routines/x.json .boulder/runs/x.json
```

The first command lists matched rules. The second should print nothing and exit
1 (none ignored), not 0. The journal budget test checks every class with Git.

## Journal layout, budget, and refusal

```text
.boulder/
  traces/                         immutable 000001-<batch-id>.jsonl segments
  trace-state/
    head.json                     sole published revision/checkpoint
    source-config.json            source UUID and database pointer
    journal-config.json           optional local segment-count budget
    writer.lock/owner.json        shared writer ownership and nonce
  trace-cache/                    reserved disposable runtime cache
  evidence/traces/                committable reviewable descriptors (minted by link)
  routines/                       reviewable routine artifacts
  runs/                           reviewable run artifacts
```

Each segment contains a header, records, and a footer with record count and
SHA-256 digest. Segments also chain predecessor hashes; `head.json` records the
final segment digest, length, sequence, and snapshot references. Only the head
publishes a revision; readers must not choose the newest filename. Publication
uses synced temporary files, renames, and directory fsync under the writer lock.
The supported durability ceiling is a tested local filesystem honoring POSIX
file/directory fsync, not network/cloud-sync storage or guaranteed macOS
`F_FULLFSYNC` power-loss durability. Hashes are tamper-evident, not tamper-proof
against someone able to rewrite the whole chain.

The default budget is **1000 final JSONL segments**
(`DEFAULT_JOURNAL_MAX_SEGMENTS` in `src/trace/journal.ts`). This is a segment-count
budget, not a byte/disk quota: large batches can still consume substantial disk.
For a persistent override, stop all writers and create this regular, unlinked
file (no symlink or hardlink):

```sh
umask 077
mkdir -p .boulder/trace-state
printf '%s\n' '{"max_segments":1000}' > .boulder/trace-state/journal-config.json
```

The only accepted field is `max_segments`, a nonnegative safe integer. Zero
freezes new commits. Missing config uses the default; malformed JSON, missing
or extra fields, fractional/negative/unsafe values fail closed with
`trace.journal_budget_config_invalid`. Linked/unsafe paths report
`trace.journal_path_unsafe`, and filesystem errors are not ignored.

At the limit a new batch throws `TraceCommitError` with code
`trace.journal_budget_exceeded`. Collect prints exactly the error prefix
`ERROR trace.journal_budget_exceeded: trace.journal_budget_exceeded`, exits
nonzero, and emits no successful collection report. No retention job or budget
path silently prunes old segments. Budget refusal in `commitBatch` happens
under the shared lock **before recovery or publication**: it writes no segment,
advances no head/snapshot checkpoint, and does not even sweep existing temps.
The lock itself is acquired and released. Complete unpublished segments count
toward the cap. A same-ID retry of the final batch can still recover and return
`duplicate` at the cap; filenames alone cannot authorize a successful retry.

Collection has existing work before `commitBatch`: it can recover a prior
interrupted commit and register a previously unregistered source. A refusal of
the new batch does not roll back that earlier recovery/registration, but never
publishes the refused observation. Explicit journal recovery is not disabled
by a full budget. Raise the configured limit deliberately or archive/reset as
below; lowering the limit never deletes anything.

## Recovery and verification failures

Stop writers and preserve a copy of the journal/state before investigating a
verification failure. Do not edit digests, delete a segment to make a chain pass,
or assume a failed write was never published. A failed write may have crossed a
rename before its final durability acknowledgment; callers retry the **same
batch ID**, not a newly allocated one, after handling any stale lock.

A held lock reports `trace.writer_busy`; neither PID nor age permits automatic
stealing. Inspect the owner without removing it:

```sh
boulder trace unlock --cwd /path/to/repo --json
```

Inspection deliberately exits nonzero with `trace.unlock_confirmation_required`
and the message `No lock removed. Stop all writers, then use trace unlock
--confirm [--nonce <n>].` After stopping **all** trace/routine/evidence writers,
use the actual inspected nonce:

```sh
boulder trace unlock --confirm --nonce 0123456789abcdef0123456789abcdef --cwd /path/to/repo
```

The example nonce is illustrative; substitute the recorded value. Omit `--nonce`
only for an ownerless crash-left lock after confirming writers are stopped.
A changed owner reports `trace.writer_nonce_mismatch` and
`Recorded writer nonce does not match; lock was not removed.` Invalid owner
metadata reports `trace.writer_owner_invalid`; no automatic removal is attempted.
Unlock removes only the lock, not corrupt journal data, and is not verification.

The next write-mode collection invokes journal recovery under the lock. Recovery
removes orphan `.tmp` entries without replaying them, verifies complete final
segments, and reconstructs a recoverable head from verified bytes. A corrupt
unpublished candidate is removed and reported as `trace.candidate_corrupt`,
not silently called success. Published corruption is retained and reports
`trace.head_digest_mismatch`. `trace.sequence_gap`,
`trace.conflicting_successors`, `trace.chain_mismatch`, and
`trace.head_segment_missing` require operator investigation/restoration, not
choosing whichever file looks newest. Budget refusal can precede these checks;
increase the budget deliberately before retrying recovery via collection.

Any strict verification failure must block serve/link certification until
repaired and reverified. Do not substitute a successful unlock or a no-op
collect for a strict verification result.

## Archive/reset: explicit loss of local backing

There is no automatic retention or reset command. **Stop all writers first**,
including routine capture; settle/inspect any lock as above. Make a restricted,
consistent archive of `.boulder/traces/` and `.boulder/trace-state/` together
(outside the committable evidence tree). Preserve source identity and budget
configuration with that archive. Inspect the archive before removing anything;
never copy only the head or delete individual segments from a live chain.

Prefer raising the budget when continued local verification of old evidence is
required. For an intentional reset after archiving, move the complete journal
and state directories out of the active repository while writers remain stopped;
move any trace cache too. Recreate only deliberate configuration: keep the source
UUID when it is the same source, but do not restore an old head into an empty
journal. The next collection starts a new journal identity and sequence.

Keep reviewed evidence descriptors, routines, and runs. A descriptor is a pinned
reference, not a backup of its segments: removing/resetting its journal makes its
backing **unavailable**, not valid evidence for the new journal. `retro weekly`
reports that unavailability (a trace binding listed with only its id) rather than
silently rebinding a descriptor or pretending it verified. Restore the matching
archived journal/state together to regain backing, without merging two chains.
Never quietly delete descriptors to hide missing backing.
