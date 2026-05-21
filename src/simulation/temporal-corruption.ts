import type { AdversarialScenario } from "./adversarial-runtime.js";

export function temporalCorruptionScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "temporal_corruption", domain: "temporal_corruption", timestamp, traceId, evidenceIds: ["sim_temporal_corruption"], expectedContainment: "HALT" };
}
