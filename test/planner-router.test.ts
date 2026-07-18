import { describe, expect, test } from "bun:test";
import { routePlanner, type PlannerAdapterStatus, type PlannerRouterInput } from "../src/planner-router.js";

const profile = (adapter = "gajae-code", fallback = "codex") => ({
  id: "programming-default",
  lanes: { plan: { adapter } },
  fallback: { plan: fallback }
});

const input = (
  adapterStatuses: Readonly<Record<string, PlannerAdapterStatus>>,
  overrides: Partial<PlannerRouterInput> = {}
): PlannerRouterInput => ({ profile: profile(), adapterStatuses, ...overrides });

describe("routePlanner", () => {
  test("routes an explicit native planner locally without external approval", () => {
    const route = routePlanner(input({}, { explicitPlanner: "boulder-native" }));

    expect(route.adapter).toBe("boulder-native");
    expect(route.source).toBe("explicit");
    expect(route.route).toBe("native");
    expect(route.action).toBe("start-native-plan");
    expect(route.reason).toBe("explicit_native");
    expect(route.liveCall).toBe(true);
  });

  test("routes the native adapter selected by the preview profile", () => {
    const route = routePlanner(input({}, { profile: profile("boulder-native") }));

    expect(route.source).toBe("profile");
    expect(route.route).toBe("native");
    expect(route.reason).toBe("profile_native");
    expect(route.liveCall).toBe(true);
  });

  test("routes an approved external adapter through the sanitized live flow", () => {
    const route = routePlanner(input({ "gajae-code": "available-approved" }));

    expect(route.route).toBe("external");
    expect(route.action).toBe("call-approved-adapter");
    expect(route.reason).toBe("external_approved");
    expect(route.liveCall).toBe(true);
  });

  test("returns only non-mutating routes for unavailable adapters", () => {
    const statuses: readonly PlannerAdapterStatus[] = [
      "available-unapproved",
      "blocked",
      "configured-unverified",
      "missing"
    ];

    for (const status of statuses) {
      for (const explicitPlanner of [undefined, "gajae-code"]) {
        const route = routePlanner(input({ "gajae-code": status }, { explicitPlanner }));

        expect(route.route).toBe("none");
        expect(route.liveCall).toBe(false);
        expect(["create-packet", "create-dry-packet", "call-approved-adapter"]).not.toContain(route.action);
        const recoveries: readonly string[] = route.recovery;
        expect(recoveries).not.toContain("request-external-approval");
        expect(route.action).toBe(status === "configured-unverified" ? "suggest-planner" : "stop");
      }
    }
  });

  test("fails closed for a blocked adapter", () => {
    const route = routePlanner(input({ "gajae-code": "blocked" }));

    expect(route.route).toBe("none");
    expect(route.reason).toBe("adapter_blocked");
    expect(route.liveCall).toBe(false);
    expect(route.recovery).toContain("select-boulder-native");
    expect(route.action).toBe("stop");
  });

  test("only suggests an unverified profile adapter", () => {
    const route = routePlanner(input({ "gajae-code": "configured-unverified" }));

    expect(route.route).toBe("none");
    expect(route.action).toBe("suggest-planner");
    expect(route.reason).toBe("adapter_unverified");
    expect(route.liveCall).toBe(false);
    expect(route.recovery).toContain("run-capability-doctor");
  });

  test("suggests recovery rather than creating a dry packet for an explicit unverified adapter", () => {
    const route = routePlanner(input({ "gajae-code": "configured-unverified" }, { explicitPlanner: "gajae-code" }));

    expect(route.route).toBe("none");
    expect(route.action).toBe("suggest-planner");
    expect(route.liveCall).toBe(false);
  });

  test("fails a missing explicit adapter and only suggests native recovery", () => {
    const route = routePlanner(input({}, { explicitPlanner: "unknown" }));

    expect(route.adapter).toBe("unknown");
    expect(route.route).toBe("none");
    expect(route.action).toBe("stop");
    expect(route.reason).toBe("adapter_missing");
    expect(route.liveCall).toBe(false);
    expect(route.fallbackAdapter).toBeNull();
    expect(route.recovery).toContain("select-boulder-native");
  });

  test("accepts a custom packet producer only after adapter-bound packet validation", () => {
    const route = routePlanner(input(
      { custom: "custom-packet-producer" },
      { profile: profile("custom"), customPacketValidation: { adapterId: "custom", valid: true } }
    ));

    expect(route.route).toBe("packet");
    expect(route.action).toBe("accept-validated-packet");
    expect(route.reason).toBe("custom_packet_validated");
    expect(route.liveCall).toBe(false);
  });

  test("fails closed when custom packet validation is absent, invalid, or belongs to another adapter", () => {
    for (const customPacketValidation of [
      undefined,
      { adapterId: "custom", valid: false },
      { adapterId: "another-adapter", valid: true }
    ]) {
      const route = routePlanner(input(
        { custom: "custom-packet-producer" },
        { profile: profile("custom"), customPacketValidation }
      ));

      expect(route.route).toBe("none");
      expect(route.action).toBe("stop");
      expect(route.reason).toBe("custom_packet_required");
      expect(route.liveCall).toBe(false);
      expect(route.recovery).toEqual(["submit-validated-packet"]);
    }
  });

  test("gives an explicit planner precedence over the profile adapter", () => {
    const route = routePlanner(input(
      { "gajae-code": "available-approved" },
      { explicitPlanner: "boulder-native", profile: profile("gajae-code") }
    ));

    expect(route.adapter).toBe("boulder-native");
    expect(route.source).toBe("explicit");
    expect(route.route).toBe("native");
    expect(route.liveCall).toBe(true);
  });

  test("returns a profile fallback only as recovery and never resolves a second hop", () => {
    const route = routePlanner(input(
      { "gajae-code": "missing", codex: "available-approved" },
      { profile: profile("gajae-code", "codex") }
    ));

    expect(route.adapter).toBe("gajae-code");
    expect(route.route).toBe("none");
    expect(route.action).toBe("stop");
    expect(route.liveCall).toBe(false);
    expect(route.fallbackAdapter).toBe("codex");
    expect(route.adapter).not.toBe("codex");
  });
});
