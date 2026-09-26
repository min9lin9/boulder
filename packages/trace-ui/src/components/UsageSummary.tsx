import type { UsageEntry } from "../api";

export function UsageSummary({ entries }: { entries: readonly UsageEntry[] }) {
  return <section className="panel" aria-labelledby="usage-heading" data-section="usage">
    <h3 id="usage-heading">Observed usage in this snapshot</h3>
    <p className="hint">Not session-lifetime totals. Entries are non-additive; raw source buckets, scopes and bases are never combined.</p>
    {entries.length === 0 ? <p data-state="usage-unavailable">Usage unavailable: no observations recorded.</p> :
      <ul className="usage-list">{entries.map((entry) => <li key={entry.span_id} data-usage-scope={entry.scope} data-usage-basis={entry.basis}>
        <h4>Scope: {entry.scope}</h4>
        <dl>{Object.entries(entry.usage).map(([metric, value]) => <div key={metric} className="usage-value" data-metric={metric}>
          <dt>{metric}</dt><dd>
            <strong>{value}</strong>
            <span className="value-label">basis: {entry.basis} / scope: {entry.scope} / non-additive</span>
            <span className="value-label">evidence id: {entry.evidence_id}</span>
          </dd>
        </div>)}</dl>
      </li>)}</ul>}
  </section>;
}
