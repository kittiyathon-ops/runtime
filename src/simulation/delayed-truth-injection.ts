import type { AdversarialScenario } from "./adversarial-runtime.js";

export function delayedTruthInjectionScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "delayed_truth_injection", domain: "delayed_truth_injection", timestamp, traceId, evidenceIds: ["sim_delayed_truth"], expectedContainment: "QUARANTINE" };
}
