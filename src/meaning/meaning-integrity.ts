export function meaningIntegrity(scores: readonly number[], evidenceIds: string[]) {
  if (scores.length === 0 || scores.some((score) => score < 0 || score > 1) || evidenceIds.length === 0) throw new Error("meaning_integrity_requires_evidence");
  const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return { status: score >= 0.75 ? "INTACT" as const : "UNSTABLE" as const, score, evidenceIds: [...evidenceIds] };
}
