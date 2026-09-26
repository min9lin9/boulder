import { describe, expect, test } from "bun:test";
import { initialView, viewReducer, type ViewRequest, type ViewState } from "./view-state";
import { bindings, catalog, detail, nextRevision, revision } from "./testing/fixture";

function request(kind: ViewRequest["kind"]): ViewRequest {
  return { kind, session: catalog.sessions[0], revision };
}
function loadedView(): ViewState {
  return viewReducer(initialView, { type: "loaded", request: initialView.request, payload: { catalog, bindings } });
}
function selectedView(): ViewState {
  const select = request("select");
  return viewReducer(viewReducer(loadedView(), { type: "request", request: select }), { type: "loaded", request: select, payload: { detail } });
}

describe("revision-pinned view transitions", () => {
  test("first coherent response pins the view; snapshot-keyed navigation supplies detail", () => {
    expect(loadedView().pinned).toEqual(revision);
    expect(selectedView().detail).toBe(detail);
    expect(selectedView().selectedSnapshotId).toBe(detail.snapshot_id);
  });

  test("a check discovers head or binding changes without replacing pinned content", () => {
    for (const updated of [{ ...catalog, head_revision: nextRevision }, { ...catalog, bindings_revision: "new-bindings" }, { ...catalog, head_revision: null }]) {
      const state = selectedView();
      const check = request("check");
      const result = viewReducer(viewReducer(state, { type: "request", request: check }), {
        type: "loaded", request: check, payload: { catalog: updated },
      });
      expect(result.stale).toBe(true);
      expect(result.catalog).toBe(state.catalog);
      expect(result.detail).toBe(state.detail);
      expect(result.bindings).toBe(state.bindings);
      expect(result.pinned).toEqual(revision);
    }
  });

  test("a bindings-only change flags stale without offering the pinned revision as available", () => {
    const state = selectedView();
    const check = request("check");
    const result = viewReducer(viewReducer(state, { type: "request", request: check }), {
      type: "loaded", request: check, payload: { catalog: { ...catalog, bindings_revision: "new-bindings" } },
    });
    expect(result.stale).toBe(true);
    expect(result.available).toBeNull();
  });

  test("new-revision detail is never mixed into the old catalog", () => {
    const select = request("select");
    const state = viewReducer(loadedView(), { type: "request", request: select });
    const result = viewReducer(state, { type: "loaded", request: select, payload: { detail: { ...detail, head_revision: nextRevision } } });
    expect(result.available).toEqual(nextRevision);
    expect(result.stale).toBe(true);
    expect(result.detail).toBeNull();
    expect(result.catalog).toBe(catalog);
  });

  test("only explicit refresh publishes the successor snapshot and independent binding revision", () => {
    const refresh = request("refresh");
    const state = viewReducer(selectedView(), { type: "request", request: refresh });
    const result = viewReducer(state, { type: "loaded", request: refresh, payload: {
      catalog: { ...catalog, head_revision: nextRevision, bindings_revision: "new-bindings" },
      detail: { ...detail, snapshot_id: "snapshot-8", head_revision: nextRevision },
      bindings: { ...bindings, head_revision: nextRevision, bindings_revision: "new-bindings" },
    } });
    expect(result.pinned).toEqual(nextRevision);
    expect(result.detail?.snapshot_id).toBe("snapshot-8");
    expect(result.selectedSnapshotId).toBe("snapshot-8");
    expect(result.available).toBeNull();
    expect(result.stale).toBe(false);
  });

  test("a mismatched head or binding response keeps the entire previous view", () => {
    for (const updated of [{ ...catalog, head_revision: nextRevision }, { ...catalog, bindings_revision: "new-bindings" }]) {
      const original = selectedView();
      const refresh = request("refresh");
      const result = viewReducer(viewReducer(original, { type: "request", request: refresh }), { type: "loaded", request: refresh, payload: {
        catalog: updated, detail, bindings,
      } });
      expect(result.catalog).toBe(original.catalog);
      expect(result.detail).toBe(original.detail);
      expect(result.bindings).toBe(original.bindings);
      expect(result.pinned).toEqual(revision);
      expect(result.stale).toBe(true);
    }
  });

  test("empty journals pin null and can discover the first published head", () => {
    const empty = viewReducer(initialView, { type: "loaded", request: initialView.request, payload: {
      catalog: { ...catalog, head_revision: null, sessions: [] }, bindings: { ...bindings, head_revision: null, bindings: [] },
    } });
    expect(empty.loading).toBe(false);
    expect(empty.catalog?.sessions).toEqual([]);
    expect(empty.pinned).toBeNull();
    const check = request("check");
    const updated = viewReducer(viewReducer(empty, { type: "request", request: check }), { type: "loaded", request: check, payload: { catalog } });
    expect(updated.stale).toBe(true);
    expect(updated.available).toEqual(revision);
    expect(updated.catalog).toBe(empty.catalog);
  });

  test("late responses and errors from overtaken requests cannot change state", () => {
    const state = selectedView();
    expect(viewReducer(state, { type: "loaded", request: initialView.request, payload: { catalog, bindings } })).toBe(state);
    expect(viewReducer(state, { type: "failed", request: initialView.request, error: "old failure" })).toBe(state);
  });

  test("fetch failure stops loading and retains pinned data", () => {
    const state = selectedView();
    const result = viewReducer(state, { type: "failed", request: state.request, error: "HTTP 409" });
    expect(result.loading).toBe(false);
    expect(result.error).toBe("HTTP 409");
    expect(result.detail).toBe(detail);
    expect(result.pinned).toEqual(revision);
  });
});
