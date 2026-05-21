import type { DeploymentProfileSpec } from "./deployment-profile.js";

export function limitedLiveProfile(allowedSymbols: readonly string[], maxOrderSize: number, maxExposure: number, evidenceIds: string[]): DeploymentProfileSpec {
  if (allowedSymbols.length === 0 || maxOrderSize <= 0 || maxExposure <= 0 || evidenceIds.length === 0) throw new Error("limited_live_profile_requires_evidence");
  return { profile: "limited-live", executionAuthority: "limited", maxOrderSize, maxExposure, allowedSymbols: [...allowedSymbols].sort(), autonomyLevel: "bounded", requiredOperatorApproval: "explicit-approval", evidenceIds: [...evidenceIds] };
}
