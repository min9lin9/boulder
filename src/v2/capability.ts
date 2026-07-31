import {
  V2_ARTIFACT_SCHEMA_VERSION,
  V2_EVIDENCE_SCHEMA_VERSION,
  type V2Artifact,
  type V2CapabilityBinding,
  type V2Digest,
  type V2Evidence,
  type V2JsonValue,
  type V2Step,
} from "./contracts.js";
import { digestV2Artifact, digestV2Content, digestV2Evidence } from "./canonical.js";

export interface V2CapabilityExecutionRequest {
  readonly planDigest: V2Digest;
  readonly step: V2Step;
  readonly observedAt: string;
}

export interface V2CapabilityExecutionOutput {
  readonly artifacts: readonly V2Artifact[];
  readonly evidence: readonly V2Evidence[];
}

export interface V2Capability {
  readonly id: string;
  readonly version: string;
  execute(request: V2CapabilityExecutionRequest): Promise<V2CapabilityExecutionOutput> | V2CapabilityExecutionOutput;
}

export interface V2CapabilityRegistry {
  resolve(binding: V2CapabilityBinding): V2Capability | undefined;
}

export const V2_FIXTURE_CAPABILITY_ID = "fixture-uppercase";
export const V2_FIXTURE_CAPABILITY_VERSION = "1.0.0";
export const V2_FIXTURE_INPUT_SCHEMA_ID = "org.example.fixture-input.v1";
export const V2_FIXTURE_SUMMARY_SCHEMA_ID = "org.example.fixture-summary.v1";
export const V2_FIXTURE_ARTIFACT_KIND = "fixture-summary";
export const V2_FIXTURE_EVIDENCE_KIND = "fixture-transform";

const LOWERCASE_ASCII = /^[a-z]+$/;

export function createV2FixtureCapability(): V2Capability {
  return {
    id: V2_FIXTURE_CAPABILITY_ID,
    version: V2_FIXTURE_CAPABILITY_VERSION,
    async execute(request): Promise<V2CapabilityExecutionOutput> {
      const message = fixtureMessage(request.step);
      if (message === undefined) throw new V2CapabilityInputError();
      const content: V2JsonValue = {
        canonicalMessage: message.toUpperCase(),
        length: message.length,
      };
      const contentDigest = await digestV2Content(content);
      const artifactWithoutDigest: Omit<V2Artifact, "artifactDigest"> = {
        schemaVersion: V2_ARTIFACT_SCHEMA_VERSION,
        id: "artifact-1",
        kind: V2_FIXTURE_ARTIFACT_KIND,
        schemaId: V2_FIXTURE_SUMMARY_SCHEMA_ID,
        subjectPlanDigest: request.planDigest,
        stepId: request.step.id,
        inputDigest: request.step.input.digest,
        contentDigest,
        content,
      };
      const artifact: V2Artifact = {
        ...artifactWithoutDigest,
        artifactDigest: await digestV2Artifact(artifactWithoutDigest),
      };
      const evidenceWithoutDigest: Omit<V2Evidence, "digest"> = {
        schemaVersion: V2_EVIDENCE_SCHEMA_VERSION,
        id: "evidence-1",
        kind: V2_FIXTURE_EVIDENCE_KIND,
        subjectArtifactId: artifact.id,
        subjectArtifactDigest: artifact.artifactDigest,
        producer: { id: V2_FIXTURE_CAPABILITY_ID, version: V2_FIXTURE_CAPABILITY_VERSION },
        observedAt: request.observedAt,
        payload: { output: message.toUpperCase() },
      };
      const evidence: V2Evidence = {
        ...evidenceWithoutDigest,
        digest: await digestV2Evidence(evidenceWithoutDigest),
      };
      return { artifacts: [artifact], evidence: [evidence] };
    },
  };
}

export function createV2FixtureCapabilityRegistry(): V2CapabilityRegistry {
  const capability = createV2FixtureCapability();
  return {
    resolve(binding): V2Capability | undefined {
      return binding.capabilityId === capability.id && binding.capabilityVersion === capability.version
        ? capability
        : undefined;
    },
  };
}

export class V2CapabilityInputError extends Error {
  readonly code = "v2.capability.input_invalid";

  constructor() {
    super("Fixture capability input is invalid.");
    this.name = "V2CapabilityInputError";
  }
}

function fixtureMessage(step: V2Step): string | undefined {
  if (step.input.schemaId !== V2_FIXTURE_INPUT_SCHEMA_ID || !isJsonRecord(step.input.value)) return undefined;
  const keys = Object.keys(step.input.value);
  const message = step.input.value.message;
  return keys.length === 1 && typeof message === "string" && LOWERCASE_ASCII.test(message) ? message : undefined;
}

function isJsonRecord(value: V2JsonValue): value is { readonly [key: string]: V2JsonValue } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
