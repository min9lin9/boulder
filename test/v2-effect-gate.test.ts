import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  type V2AuthorityEvent,
  type V2AuthorityVerifier,
  type V2EffectClass,
  type V2Plan,
  type V2Step,
} from "../src/v2/contracts.js";
import {
  authorityNonceReplayKeyV2,
  bindingForV2Effect,
  createV2InMemoryAuthorityVerifier,
  gateV2StepEffects,
} from "../src/v2/effect-gate.js";

const root = join(import.meta.dir, "..");
const publicKey = "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo";
type Vector = {
  id: string;
  event: V2AuthorityEvent;
  trustedState: {
    policyRevision: string;
    keys: Array<{ issuer: string; keyId: string; status: "active" | "revoked"; publicKey: string }>;
  };
  clock: string;
  verifierAvailable: boolean;
  nonceStateBefore: Record<string, Record<string, "consumed">>;
  expected: { firstReason: string; nonceStateAfter: Record<string, Record<string, "consumed">> };
  precedenceProbe: { clock: string; firstReason: string; nonceStateAfter: Record<string, Record<string, "consumed">> } | null;
};

async function authorityFixtures(): Promise<{ plan: V2Plan; step: V2Step; event: V2AuthorityEvent; clock: string; vectors: Vector[] }> {
  const baseline = JSON.parse(await readFile(join(root, "fixtures/v2-kernel/valid-ed25519-authority-unsupported-effect.json"), "utf8"));
  const mutations = JSON.parse(await readFile(join(root, "fixtures/v2-kernel/invalid-authority-vectors.json"), "utf8"));
  return {
    plan: baseline.envelope.plan,
    step: baseline.envelope.plan.steps[0],
    event: baseline.envelope.authorityEvents[0],
    clock: baseline.clock,
    vectors: mutations.vectors,
  };
}

const requiredAuthorityVectorIds = [
  "algorithm-unsupported",
  "key-unknown",
  "key-revoked",
  "event-digest-invalid",
  "signature-invalid",
  "timestamp-invalid",
  "expired",
  "stale",
  "policy-mismatch",
  "binding-workflow",
  "binding-plan-revision",
  "binding-step",
  "binding-effect",
  "binding-class",
  "binding-scope",
  "binding-input",
  "replayed",
  "verifier-unavailable",
] as const;

function nonceReplayKeys(state: Record<string, Record<string, "consumed">>): string[] {
  return Object.entries(state)
    .flatMap(([namespace, nonces]) => Object.keys(nonces).map((nonce) => `${namespace}\n${nonce}`))
    .sort();
}

describe("v2 effect gate", () => {
  test("covers every declared effect class without accidentally allowing authority-free effects", async () => {
    const { plan, step, event, clock } = await authorityFixtures();
    for (const effectClass of ["none", "local-read", "local-write", "remote-read", "remote-write", "communicate", "financial", "identity", "signing", "destructive"] as const) {
      const effect = { ...step.declaredEffects[0], class: effectClass };
      const candidate: V2Step = { ...step, declaredEffects: [effect] };
      const decision = await gateV2StepEffects(plan, candidate, undefined, undefined, clock);
      expect(decision.status === "allowed-no-authority" ? "allowed-no-authority" : decision.reasonCode).toBe(
        effectClass === "none" ? "allowed-no-authority" : "v2.effect.authority_missing",
      );
    }
    const ambiguous = await gateV2StepEffects(plan, step, [event, event], undefined, clock);
    expect(ambiguous).toEqual({ status: "blocked", reasonCode: "v2.effect.authority_ambiguous" });
  });

  test("verifies the exact authority-vector set and consumes nonces only through the verifier API", async () => {
    const { plan, step, vectors } = await authorityFixtures();
    const vectorIds = vectors.map((vector) => vector.id);
    expect(vectorIds).toHaveLength(requiredAuthorityVectorIds.length);
    expect(new Set(vectorIds).size).toBe(vectorIds.length);
    expect([...new Set(vectorIds)].sort()).toEqual([...requiredAuthorityVectorIds].sort());

    for (const vector of vectors) {
      const consumed = new Set(nonceReplayKeys(vector.nonceStateBefore));
      const verifier = createV2InMemoryAuthorityVerifier({
        available: vector.verifierAvailable,
        policyRevision: vector.trustedState.policyRevision,
        keys: vector.trustedState.keys,
        consumedNonces: consumed,
      });
      const authority = await verifier.verifyAndConsume(
        vector.event,
        bindingForV2Effect(plan, step, step.declaredEffects[0]),
        vector.clock,
      );
      expect(authority.reasonCode).toBe(vector.expected.firstReason);
      expect([...consumed].sort()).toEqual(nonceReplayKeys(vector.expected.nonceStateAfter));
      if (vector.precedenceProbe) {
        const probeConsumed = new Set(nonceReplayKeys(vector.nonceStateBefore));
        const probeVerifier = createV2InMemoryAuthorityVerifier({
          available: vector.verifierAvailable,
          policyRevision: vector.trustedState.policyRevision,
          keys: vector.trustedState.keys,
          consumedNonces: probeConsumed,
        });
        const probeAuthority = await probeVerifier.verifyAndConsume(
          vector.event,
          bindingForV2Effect(plan, step, step.declaredEffects[0]),
          vector.precedenceProbe.clock,
        );
        expect(probeAuthority.reasonCode).toBe(vector.precedenceProbe.firstReason);
        expect([...probeConsumed].sort()).toEqual(nonceReplayKeys(vector.precedenceProbe.nonceStateAfter));
      }
    }
  });

  test("verifies and consumes the approved non-none authority vector before reporting execution unsupported", async () => {
    const { plan, step, event, clock } = await authorityFixtures();
    const validConsumed = new Set<string>();
    const delegate = createV2InMemoryAuthorityVerifier({
      available: true,
      policyRevision: "policy-1",
      keys: [{ issuer: event.issuer, keyId: event.keyId, status: "active", publicKey }],
      consumedNonces: validConsumed,
    });
    let verifierCalls = 0;
    const verifier = {
      async verifyAndConsume(...args: Parameters<V2AuthorityVerifier["verifyAndConsume"]>) {
        verifierCalls += 1;
        return delegate.verifyAndConsume(...args);
      },
    } satisfies V2AuthorityVerifier;

    const decision = await gateV2StepEffects(plan, step, [event], verifier, clock);

    expect(decision.status).toBe("blocked");
    if (decision.status === "blocked") {
      expect(decision.reasonCode).toBe("v2.effect.unsupported");
      expect(decision.authority).toEqual({ status: "verified", reasonCode: "v2.authority.verified" });
    }
    expect(verifierCalls).toBe(1);
    expect([...validConsumed]).toEqual([authorityNonceReplayKeyV2(event)]);
  });

  test("rejects malformed declarations and authority cardinality before verification or nonce consumption", async () => {
    const { plan, step, event, clock } = await authorityFixtures();

    const expectPreVerificationRejection = async (
      candidate: V2Step,
      authorityEvents: readonly V2AuthorityEvent[] | undefined,
      reasonCode: string,
    ) => {
      const consumed = new Set(["already-consumed"]);
      const delegate = createV2InMemoryAuthorityVerifier({
        available: true,
        policyRevision: "policy-1",
        keys: [{ issuer: event.issuer, keyId: event.keyId, status: "active", publicKey }],
        consumedNonces: consumed,
      });
      let verifierCalls = 0;
      const verifier = {
        async verifyAndConsume(...args: Parameters<V2AuthorityVerifier["verifyAndConsume"]>) {
          verifierCalls += 1;
          return delegate.verifyAndConsume(...args);
        },
      } satisfies V2AuthorityVerifier;

      const decision = await gateV2StepEffects(plan, candidate, authorityEvents, verifier, clock);

      expect(decision).toEqual({ status: "blocked", reasonCode });
      expect(verifierCalls).toBe(0);
      expect([...consumed]).toEqual(["already-consumed"]);
    };

    await expectPreVerificationRejection({ ...step, declaredEffects: [] }, [event], "v2.effect.declaration_unsupported");
    await expectPreVerificationRejection(
      { ...step, declaredEffects: [step.declaredEffects[0], step.declaredEffects[0]] },
      [event],
      "v2.effect.declaration_unsupported",
    );
    await expectPreVerificationRejection(
      { ...step, declaredEffects: [{ ...step.declaredEffects[0], inputDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000" }] },
      [event],
      "v2.effect.input_mismatch",
    );
    await expectPreVerificationRejection(step, [], "v2.effect.authority_missing");
    await expectPreVerificationRejection(step, [event, event], "v2.effect.authority_ambiguous");
    await expectPreVerificationRejection(
      { ...step, declaredEffects: [{ ...step.declaredEffects[0], class: "none" }] },
      [event],
      "v2.effect.authority_unexpected",
    );
  });

  test("normalizes injected verifier failures without consuming a nonce", async () => {
    const { plan, step, event, clock } = await authorityFixtures();
    const consumed = new Set<string>();
    const verifier = {
      verifyAndConsume() {
        expect(consumed.has(authorityNonceReplayKeyV2(event))).toBe(false);
        throw new Error("verifier failure");
      },
    } satisfies V2AuthorityVerifier;

    const decision = await gateV2StepEffects(plan, step, [event], verifier, clock);

    expect(decision).toEqual({ status: "blocked", reasonCode: "v2.authority.verifier_unavailable" });
    expect([...consumed]).toEqual([]);
  });
});
