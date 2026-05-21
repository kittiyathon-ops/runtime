import type { DeploymentProfileSpec } from "./deployment-profile.js";

export function fullLiveProfile(allowedSymbols: readonly string[], maxOrderSize: number, maxExposure: number, evidenceIds: string[]): DeploymentProfileSpec {
  if (allowedSymbols.length === 0 || maxOrderSize <= 0 || maxExposure <= 0 || evidenceIds.length === 0) throw new Error("full_live_profile_requires_evidence");
  return { profile: "full-live", executionAuthority: "full", maxOrderSize, maxExposure, allowedSymbols: [...allowedSymbols].sort(), autonomyLevel: "full", requiredOperatorApproval: "two-person-review", evidenceIds: [...evidenceIds] };
}
