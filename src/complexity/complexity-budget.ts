import { complexityDecision, type ComplexityDecision } from "./complexity-types.js";

export function complexityBudget(activeDisputes: number, policyConflicts: number, maxComplexity: number, evidenceIds: string[]): ComplexityDecision {
  if (maxComplexity <= 0) throw new Error("complexity_budget_invalid");
  return complexityDecision((activeDisputes + policyConflicts * 2) / maxComplexity, "complexity_budget", evidenceIds);
}
