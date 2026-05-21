import type { DeploymentMaturityProfile } from "./deployment-profile.js";

export const DEPLOYMENT_MATURITY_ORDER: readonly DeploymentMaturityProfile[] = ["paper", "shadow", "constrained-live", "limited-live", "full-live"] as const;

export function maturityLevel(profile: DeploymentMaturityProfile, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("maturity_level_requires_evidence");
  return { profile, level: DEPLOYMENT_MATURITY_ORDER.indexOf(profile), evidenceIds: [...evidenceIds] };
}
