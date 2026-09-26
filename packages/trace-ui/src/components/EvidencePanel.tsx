import type { Binding } from "../api";

export function EvidencePanel({ bindings }: { bindings: Binding[] }) {
  return <section className="panel" aria-labelledby="evidence-heading" data-section="bindings">
    <h3 id="evidence-heading">Linked command evidence</h3>
    {bindings.length === 0 ? <p>No command evidence linked to this snapshot.</p> :
      <ul>{bindings.map((binding) => <li key={binding.binding_id}>
        <dl className="metadata">
          <dt>Binding</dt><dd><code>{binding.binding_id}</code></dd>
          <dt>Command run</dt><dd><code>{binding.boulder_command_run_id}</code></dd>
          <dt>Snapshot</dt><dd><code>{binding.snapshot_id}</code></dd>
        </dl>
      </li>)}</ul>}
  </section>;
}
