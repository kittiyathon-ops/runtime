export function survivabilityScore(continuity: number, governance: number, replay: number, epistemic: number, entropyPenalty: number, degradationPenalty: number, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("survivability_score_requires_evidence");
  const score = Math.max(0, (continuity + governance + replay + epistemic) / 4 - entropyPenalty - degradationPenalty);
  return { score, status: score >= 0.7 ? "SURVIVABLE" as const : "SURVIVABILITY_AT_RISK" as const, evidenceIds: [...evidenceIds] };
}
