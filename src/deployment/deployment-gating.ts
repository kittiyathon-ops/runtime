import type { DeploymentMode } from "./deployment-profile.js";

export interface DeploymentGate {
  readonly gateId: string;
  readonly passed: boolean;
  readonly evidenceIds: readonly string[];
}

export function deploymentGating(mode: DeploymentMode, gates: readonly DeploymentGate[], evidenceIds: string[]) {
  if (gates.length === 0 || evidenceIds.length === 0) throw new Error("deployment_gating_requires_evidence");
  const failed = gates.filter((gate) => !gate.passed).map((gate) => gate.gateId);
  const gatedMode: DeploymentMode = failed.length === 0 ? mode : "SURVIVAL_ONLY";
  return {
    status: failed.length === 0 ? "DEPLOYMENT_ALLOWED" as const : "DEPLOYMENT_FAIL_CLOSED" as const,
    requestedMode: mode,
    gatedMode,
    failed,
    evidenceIds: [...evidenceIds]
  };
}
