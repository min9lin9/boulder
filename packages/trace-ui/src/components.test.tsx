import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "./App";
import { sameRevision } from "./api";
import { RevisionHeader } from "./components/RevisionHeader";
import { SessionDetail } from "./components/SessionDetail";
import { SessionList } from "./components/SessionList";
import { StaleRevisionNotice } from "./components/StaleRevisionNotice";
import { TraceTree } from "./components/TraceTree";
import { UnresolvedSection } from "./components/UnresolvedSection";
import { UsageSummary } from "./components/UsageSummary";
import { bindings, catalog, detail, hostileText, nextRevision, revision } from "./testing/fixture";

async function attributes(html: string, selector: string, attribute: string) {
  const values: (string | null)[] = [];
  await new HTMLRewriter().on(selector, { element(element) { values.push(element.getAttribute(attribute)); } }).transform(new Response(html)).text();
  return values;
}

describe("trace UI rendered structure", () => {
  test("presentation hierarchy follows display parents, never execution parents", async () => {
    const html = renderToStaticMarkup(<TraceTree entries={detail.hierarchy} />);
    expect(await attributes(html, '[data-entry-id="turn"] > details > ul > li', "data-entry-id")).toEqual(["call", "tool"]);
    expect(await attributes(html, '[data-entry-id="exec-parent"] [data-entry-id]', "data-entry-id")).toEqual([]);
    expect(await attributes(html, '[data-entry-id="call"] [data-provenance]', "data-provenance")).toEqual(["execution-parent"]);
  });

  test("unresolved entries stay in their own section even with a matching display parent", async () => {
    const html = renderToStaticMarkup(<SessionDetail session={detail} bindings={bindings.bindings} />);
    expect(await attributes(html, '[data-section="trace"] [data-entry-id="unmatched"]', "data-entry-id")).toEqual([]);
    expect(await attributes(html, '[data-section="unresolved"] [data-unresolved-order]', "data-unresolved-order")).toEqual(["4", "5"]);
    expect(await attributes(html, '[data-unresolved-reason]', "data-unresolved-reason")).toEqual(["unresolved_tool_result", "decode_parse"]);
    expect(html).toContain("command-7");
    expect(html).not.toContain("another-command");
  });

  test("usage retains raw buckets, separate scopes and bases, and zero without invented totals", async () => {
    const html = renderToStaticMarkup(<UsageSummary entries={detail.usage.entries} />);
    expect(await attributes(html, '[data-usage-scope]', "data-usage-scope")).toEqual(["unknown", "turn"]);
    expect(await attributes(html, '[data-usage-basis]', "data-usage-basis")).toEqual(["source_reported", "normalized_mapping"]);
    expect(await attributes(html, '[data-metric]', "data-metric")).toEqual(["promptTokens", "completionTokens", "cacheReadTokens", "input_tokens"]);
    expect(html).toContain("<strong>21</strong>");
    expect(html).toContain("<strong>4</strong>");
    expect(html).not.toContain("<strong>25</strong>");
    expect(html).toContain("<strong>0</strong>");
    expect(html).toContain("usage-1");
  });

  test("stale revision compares both sequence and digest", async () => {
    const same = renderToStaticMarkup(<StaleRevisionNotice stale={!sameRevision(revision, { ...revision })} onRefresh={() => {}} />);
    expect(same).toBe("");
    for (const returned of [nextRevision, { ...revision, digest: "changed-digest" }]) {
      const html = renderToStaticMarkup(<StaleRevisionNotice stale={!sameRevision(revision, returned)} onRefresh={() => {}} />);
      expect(await attributes(html, '[data-state]', "data-state")).toEqual(["stale-revision"]);
      expect(await attributes(html, 'button', "type")).toEqual(["button"]);
    }
    const header = renderToStaticMarkup(<RevisionHeader revision={revision} snapshotId={detail.snapshot_id} />);
    expect(await attributes(header, '[data-revision-sequence]', "data-revision-sequence")).toEqual(["7"]);
    expect(header).toContain("snapshot-7");
    expect(header).toContain(revision.digest.slice(0, 12));
  });

  test("transcript strings are escaped in tree, unresolved, sessions, and bindings", async () => {
    const html = renderToStaticMarkup(<>
      <SessionDetail session={detail} bindings={[{ ...bindings.bindings[0], boulder_command_run_id: hostileText }]} />
      <SessionList sessions={[{ ...catalog.sessions[0], session_id: hostileText }]} selectedId={null} onSelect={() => {}} />
    </>);
    expect(await attributes(html, "img,script", "src")).toEqual([]);
    expect(html).toContain("&lt;img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain(hostileText);
  });

  test("loading, no sessions, unresolved-empty, and usage-unavailable are distinct", async () => {
    const html = renderToStaticMarkup(<>
      <App />
      <SessionList sessions={[]} selectedId={null} onSelect={() => {}} />
      <UnresolvedSection entries={[]} />
      <UsageSummary entries={[]} />
    </>);
    expect(await attributes(html, '[data-state]', "data-state")).toEqual(["loading", "no-sessions", "unresolved-empty", "usage-unavailable"]);
  });
});
