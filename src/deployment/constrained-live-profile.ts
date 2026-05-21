import type { DeploymentProfileSpec } from "./deployment-profile.js";

export function constrainedLiveProfile(allowedSymbols: readonly string[], maxOrderSize: number, maxExposure: number, evidenceIds: string[]): DeploymentProfileSpec {
  if (allowedSymbols.length === 0 || maxOrderSize <= 0 || maxExposure <= 0 || evidenceIds.length === 0) throw new Error("constrained_live_profile_requires_evidence");
  return { profile: "constrained-live", executionAuthority: "reduce-only", maxOrderSize, maxExposure, allowedSymbols: [...allowedSymbols].sort(), autonomyLevel: "operator-approved", requiredOperatorApproval: "explicit-approval", evidenceIds: [...evidenceIds] };
}
