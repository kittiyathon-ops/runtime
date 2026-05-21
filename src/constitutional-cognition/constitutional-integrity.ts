export function constitutionalIntegrity(scores: readonly number[], evidenceIds: string[]) {
  if (scores.length === 0 || scores.some((score) => score < 0 || score > 1)) throw new Error("constitutional_integrity_scores_invalid");
  if (evidenceIds.length === 0) throw new Error("constitutional_integrity_requires_evidence");
  const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return { status: score >= 0.8 ? "VALID" as const : "UNSTABLE" as const, score, evidenceIds: [...evidenceIds] };
}
