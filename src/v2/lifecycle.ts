export const V2_LIFECYCLE_STATES = [
  "received",
  "plan-validated",
  "effect-gated",
  "executing",
  "result-produced",
  "critiqued",
  "blocked",
] as const;

export type V2LifecycleState = (typeof V2_LIFECYCLE_STATES)[number];

export const V2_LIFECYCLE_TRANSITIONS: Readonly<Record<V2LifecycleState, readonly V2LifecycleState[]>> = {
  received: ["plan-validated", "blocked"],
  "plan-validated": ["effect-gated", "blocked"],
  "effect-gated": ["executing", "blocked"],
  executing: ["result-produced", "blocked"],
  "result-produced": ["critiqued", "blocked"],
  critiqued: [],
  blocked: [],
};

export interface V2LifecycleTransition {
  readonly from: V2LifecycleState;
  readonly to: V2LifecycleState;
}

export type V2LifecycleTransitionResult =
  | { readonly ok: true; readonly value: V2LifecycleTransition }
  | { readonly ok: false; readonly reasonCode: "v2.lifecycle.transition_invalid" };

export function canTransitionV2Lifecycle(from: V2LifecycleState, to: V2LifecycleState): boolean {
  return V2_LIFECYCLE_TRANSITIONS[from].includes(to);
}

export function transitionV2Lifecycle(from: V2LifecycleState, to: V2LifecycleState): V2LifecycleTransitionResult {
  return canTransitionV2Lifecycle(from, to)
    ? { ok: true, value: { from, to } }
    : { ok: false, reasonCode: "v2.lifecycle.transition_invalid" };
}
