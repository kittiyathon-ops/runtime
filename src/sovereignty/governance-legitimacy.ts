export function governanceLegitimacy(score: number, evidenceIds: string[]) {
  if (score < 0 || score > 1 || evidenceIds.length === 0) throw new Error("governance_legitimacy_requires_evidence");
  return { status: score >= 0.75 ? "LEGITIMATE" as const : "ILLEGITIMATE" as const, score, evidenceIds: [...evidenceIds] };
}
