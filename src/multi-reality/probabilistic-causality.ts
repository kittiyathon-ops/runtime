export function probabilisticCausality(causeProbability: number, effectProbability: number, evidenceIds: string[]) {
  if (causeProbability < 0 || causeProbability > 1 || effectProbability < 0 || effectProbability > 1) throw new Error("causality_probability_invalid");
  if (evidenceIds.length === 0) throw new Error("probabilistic_causality_requires_evidence");
  const joint = causeProbability * effectProbability;
  return { status: joint >= 0.5 ? "OPERATIONALLY_TRUSTED" as const : "WEAK" as const, jointProbability: joint, evidenceIds: [...evidenceIds] };
}
