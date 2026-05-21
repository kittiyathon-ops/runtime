import { DEPLOYMENT_MATURITY_ORDER } from "./maturity-level.js";
import type { DeploymentMaturityProfile } from "./deployment-profile.js";

export interface DeploymentMaturityGateInput {
  readonly currentProfile: DeploymentMaturityProfile;
  readonly requestedProfile: DeploymentMaturityProfile;
  readonly certificationPassed: boolean;
  readonly burnInPassed: boolean;
  readonly activeIncident: boolean;
  readonly reconciliationFresh: boolean;
  readonly desyncActive: boolean;
}

export function deploymentGates(input: DeploymentMaturityGateInput, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("deployment_gates_require_evidence");
  const currentLevel = DEPLOYMENT_MATURITY_ORDER.indexOf(input.currentProfile);
  const requestedLevel = DEPLOYMENT_MATURITY_ORDER.indexOf(input.requestedProfile);
  const upgrade = requestedLevel > currentLevel;
  const failures: string[] = [];
  if (input.requestedProfile === "full-live" && !input.certificationPassed) failures.push("full_live_requires_certification");
  if (upgrade && !input.burnInPassed) failures.push("autonomy_increase_requires_burn_in");
  if (upgrade && input.activeIncident) failures.push("deployment_upgrade_blocked_during_incident");
  if (!input.reconciliationFresh) failures.push("execution_blocked_by_stale_reconciliation");
  if (input.desyncActive) failures.push("order_submission_blocked_by_desync");
  return {
    status: failures.length === 0 ? "DEPLOYMENT_GATE_PASSED" as const : "DEPLOYMENT_GATE_BLOCKED" as const,
    upgrade,
    failures,
    executionAllowed: failures.length === 0,
    evidenceIds: [...evidenceIds]
  };
}
