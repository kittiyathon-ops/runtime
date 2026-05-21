import type { AdversarialScenario } from "./adversarial-runtime.js";

export function fakeRealityScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "fake_reality", domain: "fake_reality", timestamp, traceId, evidenceIds: ["sim_fake_reality"], expectedContainment: "REJECT" };
}
