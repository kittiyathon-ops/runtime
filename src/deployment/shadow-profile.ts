import type { DeploymentProfileSpec } from "./deployment-profile.js";

export function shadowProfile(allowedSymbols: readonly string[], evidenceIds: string[]): DeploymentProfileSpec {
  if (allowedSymbols.length === 0 || evidenceIds.length === 0) throw new Error("shadow_profile_requires_evidence");
  return { profile: "shadow", executionAuthority: "observe", maxOrderSize: 0, maxExposure: 0, allowedSymbols: [...allowedSymbols].sort(), autonomyLevel: "manual", requiredOperatorApproval: "acknowledgement", evidenceIds: [...evidenceIds] };
}
