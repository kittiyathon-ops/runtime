import type { SurvivabilityPrimitive } from "./survivability-primitives.js";

export interface AbstractionCollapseInput {
  abstractionId: string;
  primitiveId: SurvivabilityPrimitive;
  justification: string;
  replayPreserved: boolean;
  constitutionalContinuityPreserved: boolean;
  explainabilityPreserved: boolean;
  evidenceIds: string[];
}

export function abstractionCollapse(input: AbstractionCollapseInput) {
  if (input.abstractionId.length === 0 || input.justification.length === 0 || input.evidenceIds.length === 0) {
    throw new Error("abstraction_collapse_requires_evidence");
  }
  const safe = input.replayPreserved && input.constitutionalContinuityPreserved && input.explainabilityPreserved;
  return {
    abstractionId: input.abstractionId,
    primitiveId: input.primitiveId,
    status: safe ? "COLLAPSE_ALLOWED" as const : "COLLAPSE_BLOCKED" as const,
    justification: input.justification,
    replayPreserved: input.replayPreserved,
    constitutionalContinuityPreserved: input.constitutionalContinuityPreserved,
    explainabilityPreserved: input.explainabilityPreserved,
    evidenceIds: [...input.evidenceIds]
  };
}
