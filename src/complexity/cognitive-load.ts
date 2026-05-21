import { complexityDecision, type ComplexityDecision } from "./complexity-types.js";

export interface CognitiveLoadInput {
  activeDisputes: number;
  unresolvedContradictions: number;
  trustFractures: number;
  maxCognitiveLoad: number;
  evidenceIds: string[];
}

export function cognitiveLoad(input: CognitiveLoadInput): ComplexityDecision {
  if (input.maxCognitiveLoad <= 0) throw new Error("cognitive_load_budget_invalid");
  const weightedLoad = input.activeDisputes + input.unresolvedContradictions + input.trustFractures * 2;
  return complexityDecision(weightedLoad / input.maxCognitiveLoad, "cognitive_load", input.evidenceIds);
}
