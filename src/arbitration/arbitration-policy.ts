export interface ArbitrationInput {
  contradictionWeight: number;
  provenanceStrength: number;
  temporalConsistency: number;
  survivabilityPriority: number;
  governanceLegitimacy: number;
  replayConsistency: number;
  operationalUrgency: number;
  evidenceIds: string[];
}

export function arbitrationPolicy(input: ArbitrationInput) {
  if (input.evidenceIds.length === 0) throw new Error("arbitration_requires_evidence");
  const score = (input.provenanceStrength + input.temporalConsistency + input.survivabilityPriority + input.governanceLegitimacy + input.replayConsistency + input.operationalUrgency - input.contradictionWeight) / 6;
  return { status: score >= 0.7 ? "ARBITRATE" as const : "DEGRADE" as const, score, evidenceIds: [...input.evidenceIds] };
}
