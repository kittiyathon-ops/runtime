import { createHash } from "node:crypto";

export type CanonicalValue = string | number | boolean | null | CanonicalValue[] | { [key: string]: CanonicalValue };

export function canonicalize(value: CanonicalValue): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key] ?? null)}`).join(",")}}`;
}

export function identityFingerprint(value: CanonicalValue): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
