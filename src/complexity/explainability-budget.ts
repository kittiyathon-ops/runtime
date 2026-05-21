import { complexityDecision, type ComplexityDecision } from "./complexity-types.js";

export function explainabilityBudget(recursionDepth: number, maxDepth: number, evidenceIds: string[]): ComplexityDecision {
  if (maxDepth <= 0) throw new Error("explainability_budget_invalid");
  return complexityDecision(recursionDepth / maxDepth, "explainability_budget", evidenceIds);
}
