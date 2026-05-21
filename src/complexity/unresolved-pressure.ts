import { complexityDecision, type ComplexityDecision } from "./complexity-types.js";

export interface UnresolvedPressureInput {
  unresolvedContradictions: number;
  unresolvedGovernanceConflicts: number;
  unresolvedCausalConflicts: number;
  maxUnresolvedPressure: number;
  evidenceIds: string[];
}

export function unresolvedPressure(input: UnresolvedPressureInput): ComplexityDecision {
  if (input.maxUnresolvedPressure <= 0) throw new Error("unresolved_pressure_budget_invalid");
  const score = (input.unresolvedContradictions + input.unresolvedGovernanceConflicts * 2 + input.unresolvedCausalConflicts * 2) / input.maxUnresolvedPressure;
  return complexityDecision(score, "unresolved_pressure", input.evidenceIds);
}
