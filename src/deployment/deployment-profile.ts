export type DeploymentMode = "SHADOW" | "PAPER" | "LIMITED_CAPITAL" | "RESTRICTED" | "LIVE" | "DEGRADED" | "SURVIVAL_ONLY";
export type DeploymentMaturityProfile = "paper" | "shadow" | "constrained-live" | "limited-live" | "full-live";
export type ExecutionAuthority = "none" | "observe" | "paper" | "reduce-only" | "limited" | "full";
export type AutonomyLevel = "manual" | "operator-approved" | "bounded" | "full";
export type OperatorApprovalLevel = "none" | "acknowledgement" | "explicit-approval" | "two-person-review";

export interface DeploymentProfileSpec {
  readonly profile: DeploymentMaturityProfile;
  readonly executionAuthority: ExecutionAuthority;
  readonly maxOrderSize: number;
  readonly maxExposure: number;
  readonly allowedSymbols: readonly string[];
  readonly autonomyLevel: AutonomyLevel;
  readonly requiredOperatorApproval: OperatorApprovalLevel;
  readonly evidenceIds: readonly string[];
}

export function deploymentProfile(mode: DeploymentMode, evidenceRecording: boolean, governanceAuthority: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("deployment_profile_requires_evidence");
  return {
    mode,
    status: evidenceRecording && governanceAuthority ? "DEPLOYMENT_PROFILE_ACCEPTED" as const : "DEPLOYMENT_PROFILE_REJECTED" as const,
    evidenceRecording,
    governanceAuthority,
    evidenceIds: [...evidenceIds]
  };
}

export function deploymentProfileSpec(spec: DeploymentProfileSpec, evidenceIds: string[]) {
  if (spec.allowedSymbols.length === 0 || spec.maxOrderSize < 0 || spec.maxExposure < 0 || spec.evidenceIds.length === 0 || evidenceIds.length === 0) throw new Error("deployment_profile_spec_requires_evidence");
  return {
    status: "DEPLOYMENT_PROFILE_SPEC_ACCEPTED" as const,
    profile: spec.profile,
    executionAuthority: spec.executionAuthority,
    maxOrderSize: spec.maxOrderSize,
    maxExposure: spec.maxExposure,
    allowedSymbols: [...spec.allowedSymbols].sort(),
    autonomyLevel: spec.autonomyLevel,
    requiredOperatorApproval: spec.requiredOperatorApproval,
    evidenceIds: [...evidenceIds, ...spec.evidenceIds].sort()
  };
}
