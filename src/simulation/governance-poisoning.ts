import type { AdversarialScenario } from "./adversarial-runtime.js";

export function governancePoisoningScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "governance_poisoning", domain: "governance_poisoning", timestamp, traceId, evidenceIds: ["sim_governance_poisoning"], expectedContainment: "SAFE_MODE" };
}
