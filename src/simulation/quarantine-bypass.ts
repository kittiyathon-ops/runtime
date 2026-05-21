import type { AdversarialScenario } from "./adversarial-runtime.js";

export function quarantineBypassScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "quarantine_bypass", domain: "quarantine_bypass", timestamp, traceId, evidenceIds: ["sim_quarantine_bypass"], expectedContainment: "REJECT" };
}
