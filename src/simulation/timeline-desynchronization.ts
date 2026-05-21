import type { AdversarialScenario } from "./adversarial-runtime.js";

export function timelineDesynchronizationScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "timeline_desynchronization", domain: "timeline_desynchronization", timestamp, traceId, evidenceIds: ["sim_timeline_desync"], expectedContainment: "HALT" };
}
