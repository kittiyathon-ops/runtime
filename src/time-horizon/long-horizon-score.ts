export function longHorizonScore(scores: readonly number[], evidenceIds: string[]) {
  if (scores.length === 0 || evidenceIds.length === 0) throw new Error("long_horizon_score_requires_evidence");
  const score = scores.reduce((sum, item) => sum + item, 0) / scores.length;
  return { status: score >= 0.7 ? "LONG_HORIZON_STABLE" as const : "LONG_HORIZON_UNSTABLE" as const, score, evidenceIds: [...evidenceIds] };
}
