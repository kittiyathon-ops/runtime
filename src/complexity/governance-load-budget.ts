import { complexityDecision, type ComplexityDecision } from "./complexity-types.js";

export function governanceLoadBudget(activeActions: number, maxActions: number, evidenceIds: string[]): ComplexityDecision {
  if (maxActions <= 0) throw new Error("governance_load_budget_invalid");
  return complexityDecision(activeActions / maxActions, "governance_load_budget", evidenceIds);
}
