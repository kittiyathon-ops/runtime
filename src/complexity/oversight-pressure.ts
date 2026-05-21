import { complexityDecision, type ComplexityDecision } from "./complexity-types.js";

export function oversightPressure(pendingApprovals: number, maxApprovals: number, evidenceIds: string[]): ComplexityDecision {
  if (maxApprovals <= 0) throw new Error("oversight_budget_invalid");
  return complexityDecision(pendingApprovals / maxApprovals, "oversight_pressure", evidenceIds);
}
