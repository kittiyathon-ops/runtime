import type { AdversarialScenario } from "./adversarial-runtime.js";

export function capabilityEscalationScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "capability_escalation", domain: "capability_escalation", timestamp, traceId, evidenceIds: ["sim_capability_escalation"], expectedContainment: "REJECT" };
}
