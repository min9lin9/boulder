export type PlannerAdapterStatus =
  | "available-approved"
  | "available-unapproved"
  | "blocked"
  | "configured-unverified"
  | "missing"
  | "custom-packet-producer";

export type PlannerRouteKind = "native" | "external" | "packet" | "none";

export type PlannerAction =
  | "start-native-plan"
  | "call-approved-adapter"
  | "accept-validated-packet"
  | "suggest-planner"
  | "stop";

export type PlannerRouteReason =
  | "explicit_native"
  | "profile_native"
  | "external_approved"
  | "external_approval_required"
  | "adapter_blocked"
  | "adapter_unverified"
  | "adapter_missing"
  | "custom_packet_validated"
  | "custom_packet_required";

export type PlannerRecovery =
  | "review-approval-requirement"
  | "submit-validated-packet"
  | "run-capability-doctor"
  | "select-boulder-native"
  | "select-another-planner"
  | "review-profile-fallback";

export interface PlannerRouterProfile {
  readonly id: string;
  readonly lanes: { readonly plan: { readonly adapter: string } };
  readonly fallback: { readonly plan: string };
}

export interface CustomPacketValidation {
  readonly adapterId: string;
  readonly valid: boolean;
}

export interface PlannerRouterInput {
  readonly explicitPlanner?: string | null;
  readonly profile: PlannerRouterProfile;
  readonly adapterStatuses: Readonly<Record<string, PlannerAdapterStatus>>;
  readonly customPacketValidation?: CustomPacketValidation;
}

export interface PlannerRoute {
  readonly adapter: string;
  readonly source: "explicit" | "profile";
  readonly route: PlannerRouteKind;
  readonly action: PlannerAction;
  readonly reason: PlannerRouteReason;
  readonly recovery: readonly PlannerRecovery[];
  readonly liveCall: boolean;
  readonly fallbackAdapter: string | null;
}

const nativeAdapter = "boulder-native";

/**
 * Selects one plan adapter without invoking it. This router deliberately never
 * resolves a fallback adapter: profile v1 has only a single fallback string,
 * not a fallback chain.
 */
export function routePlanner(input: PlannerRouterInput): PlannerRoute {
  const explicit = nonEmpty(input.explicitPlanner);
  const adapter = explicit ? input.explicitPlanner.trim() : input.profile.lanes.plan.adapter;
  const source = explicit ? "explicit" : "profile";

  if (adapter === nativeAdapter) {
    return result(adapter, source, "native", "start-native-plan", explicit ? "explicit_native" : "profile_native", [], true);
  }

  const status = input.adapterStatuses[adapter] ?? "missing";
  if (status === "available-approved") {
    return result(adapter, source, "external", "call-approved-adapter", "external_approved", [], true);
  }
  if (status === "custom-packet-producer") {
    if (isValidatedForAdapter(input.customPacketValidation, adapter)) {
      return result(adapter, source, "packet", "accept-validated-packet", "custom_packet_validated", [], false);
    }
    return result(adapter, source, "none", "stop", "custom_packet_required", ["submit-validated-packet"], false);
  }
  if (status === "available-unapproved") {
    return result(
      adapter,
      source,
      "none",
      "stop",
      "external_approval_required",
      ["review-approval-requirement", "select-boulder-native"],
      false
    );
  }
  if (status === "blocked") {
    return result(adapter, source, "none", "stop", "adapter_blocked", ["select-another-planner", "select-boulder-native"], false);
  }
  if (status === "configured-unverified") {
    return result(
      adapter,
      source,
      "none",
      "suggest-planner",
      "adapter_unverified",
      ["run-capability-doctor", "select-another-planner", "select-boulder-native"],
      false
    );
  }

  return result(
    adapter,
    source,
    "none",
    "stop",
    "adapter_missing",
    explicit ? ["select-boulder-native", "select-another-planner"] : ["review-profile-fallback", "select-boulder-native"],
    false,
    explicit ? null : input.profile.fallback.plan
  );
}

function result(
  adapter: string,
  source: PlannerRoute["source"],
  route: PlannerRouteKind,
  action: PlannerAction,
  reason: PlannerRouteReason,
  recovery: readonly PlannerRecovery[],
  liveCall: boolean,
  fallbackAdapter: string | null = null
): PlannerRoute {
  return { adapter, source, route, action, reason, recovery, liveCall, fallbackAdapter };
}

function isValidatedForAdapter(
  validation: CustomPacketValidation | undefined,
  adapter: string
): boolean {
  return validation?.valid === true && validation.adapterId === adapter;
}
function nonEmpty(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
