import type { AdversarialScenario } from "./adversarial-runtime.js";

export function staleValidObservationScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "stale_valid_observation", domain: "stale_valid_observation", timestamp, traceId, evidenceIds: ["sim_stale_valid"], expectedContainment: "SAFE_MODE" };
}
