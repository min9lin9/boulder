import { isV2Digest, type V2Digest, type V2JsonValue } from "./contracts.js";

export function stringData(value: V2JsonValue | undefined): string {
  if (typeof value !== "string") throw new Error("validated Work event string missing");
  return value;
}

export function numberData(value: V2JsonValue | undefined): number {
  if (typeof value !== "number") throw new Error("validated Work event number missing");
  return value;
}

export function digestData(value: V2JsonValue | undefined): V2Digest {
  if (!isV2Digest(value)) throw new Error("validated Work event digest missing");
  return value;
}

export function optionalDigestData(value: V2JsonValue | undefined): V2Digest | undefined {
  return value === undefined ? undefined : digestData(value);
}

export function digestOrNullData(value: V2JsonValue | undefined): V2Digest | null {
  return value === null ? null : digestData(value);
}

export function nullableStringData(value: V2JsonValue | undefined): string | null {
  return value === null ? null : stringData(value);
}

export function requiredDigest(value: V2Digest | null | undefined): V2Digest {
  if (!value) throw new Error("validated Work digest missing");
  return value;
}

export function runnerData(value: V2JsonValue | undefined): "in-process" | "process" {
  return value === "in-process" ? "in-process" : "process";
}

export function terminalStatusData(
  value: V2JsonValue | undefined
): "completed" | "failed" | "cancelled" {
  if (value === "completed" || value === "failed") return value;
  return "cancelled";
}
