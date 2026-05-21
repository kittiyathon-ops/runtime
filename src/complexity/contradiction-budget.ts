import { complexityDecision, type ComplexityDecision } from "./complexity-types.js";

export function contradictionBudget(unresolvedContradictions: number, maxContradictions: number, evidenceIds: string[]): ComplexityDecision {
  if (maxContradictions <= 0) throw new Error("contradiction_budget_invalid");
  return complexityDecision(unresolvedContradictions / maxContradictions, "contradiction_budget", evidenceIds);
}
