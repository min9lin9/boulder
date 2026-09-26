import type { Binding, SessionResponse } from "../api";
import { EvidencePanel } from "./EvidencePanel";
import { TraceTree } from "./TraceTree";
import { UnresolvedSection } from "./UnresolvedSection";
import { UsageSummary } from "./UsageSummary";

export function SessionDetail({ session, bindings }: { session: SessionResponse; bindings: Binding[] }) {
  return <section aria-labelledby="session-heading" data-session-id={session.session_id}>
    <h2 id="session-heading">Session <code>{session.session_id}</code></h2>
    <UsageSummary entries={session.usage.entries} />
    <TraceTree entries={session.hierarchy} />
    <UnresolvedSection entries={session.unresolved} />
    <EvidencePanel bindings={bindings.filter((binding) => binding.snapshot_id === session.snapshot_id)} />
  </section>;
}
