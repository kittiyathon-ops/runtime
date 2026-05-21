import { complexityDecision, type ComplexityDecision } from "./complexity-types.js";

export function semanticDensity(uniqueConcepts: number, eventCount: number, evidenceIds: string[]): ComplexityDecision {
  if (eventCount <= 0) throw new Error("semantic_event_count_invalid");
  return complexityDecision(uniqueConcepts / eventCount, "semantic_density", evidenceIds);
}
