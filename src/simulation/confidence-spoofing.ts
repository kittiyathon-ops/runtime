import type { AdversarialScenario } from "./adversarial-runtime.js";

export function confidenceSpoofingScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "confidence_spoofing", domain: "confidence_spoofing", timestamp, traceId, evidenceIds: ["sim_confidence_spoofing"], expectedContainment: "REJECT" };
}
