import type { HeadRevision } from "../api";

export function RevisionHeader({ revision, snapshotId }: { revision: HeadRevision | null; snapshotId?: string }) {
  return <header className="revision-header" data-revision-sequence={revision?.sequence ?? 0}>
    <strong>Revision pinned</strong>
    <span>{revision ? <>Head {revision.sequence} / <code title={revision.digest}>{revision.digest.slice(0, 12)}</code></> : "No published head"}</span>
    <span>Snapshot: {snapshotId ? <code>{snapshotId}</code> : "no session selected"}</span>
  </header>;
}
