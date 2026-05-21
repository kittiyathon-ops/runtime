import type { CompatibilityMode } from "./event-types.js";

export interface SchemaCompatibilityResult {
  compatible: boolean;
  mode: CompatibilityMode;
  reason?: string;
}

export function evaluateSchemaCompatibility(fromVersion: number, toVersion: number): SchemaCompatibilityResult {
  if (!Number.isInteger(fromVersion) || !Number.isInteger(toVersion) || fromVersion <= 0 || toVersion <= 0) {
    return { compatible: false, mode: "none", reason: "schema_version_invalid" };
  }
  if (fromVersion === toVersion) return { compatible: true, mode: "backward" };
  if (fromVersion < toVersion) return { compatible: true, mode: "backward" };
  return { compatible: false, mode: "none", reason: "downgrade_not_supported" };
}
