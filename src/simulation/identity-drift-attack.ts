import type { AdversarialScenario } from "./adversarial-runtime.js";

export function identityDriftAttackScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "identity_drift_attack", domain: "identity_drift_attack", timestamp, traceId, evidenceIds: ["sim_identity_drift"], expectedContainment: "HALT" };
}
