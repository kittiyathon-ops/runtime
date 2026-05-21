import type { DeploymentProfileSpec } from "./deployment-profile.js";

export function paperProfile(allowedSymbols: readonly string[], evidenceIds: string[]): DeploymentProfileSpec {
  if (allowedSymbols.length === 0 || evidenceIds.length === 0) throw new Error("paper_profile_requires_evidence");
  return { profile: "paper", executionAuthority: "paper", maxOrderSize: 0, maxExposure: 0, allowedSymbols: [...allowedSymbols].sort(), autonomyLevel: "manual", requiredOperatorApproval: "none", evidenceIds: [...evidenceIds] };
}
