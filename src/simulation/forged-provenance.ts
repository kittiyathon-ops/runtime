import type { AdversarialScenario } from "./adversarial-runtime.js";

export function forgedProvenanceScenario(timestamp: number, traceId: string): AdversarialScenario {
  return { scenarioId: "forged_provenance", domain: "forged_provenance", timestamp, traceId, evidenceIds: ["sim_forged_provenance"], expectedContainment: "REJECT" };
}
