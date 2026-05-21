import { deploymentGates, type DeploymentMaturityGateInput } from "./deployment-gates.js";

export function deploymentGatekeeper(input: DeploymentMaturityGateInput, evidenceIds: string[]) {
  const gate = deploymentGates(input, evidenceIds);
  return {
    status: gate.status === "DEPLOYMENT_GATE_PASSED" ? "DEPLOYMENT_UPGRADE_ALLOWED" as const : "DEPLOYMENT_UPGRADE_BLOCKED" as const,
    failures: gate.failures,
    executionAllowed: gate.executionAllowed,
    evidenceIds: [...evidenceIds]
  };
}
