import type { AdversarialScenario } from "./adversarial-runtime.js";

export function replayDivergenceScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "replay_divergence", domain: "replay_divergence", timestamp, traceId, evidenceIds: ["sim_replay_divergence"], expectedContainment: "HALT" };
}
