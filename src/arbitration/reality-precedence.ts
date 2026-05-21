export function realityPrecedence(candidates: readonly { realityId: string; score: number; evidenceIds: string[] }[]) {
  if (candidates.length === 0) throw new Error("reality_precedence_requires_candidates");
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.realityId.localeCompare(b.realityId));
  const selected = sorted[0]!;
  return { selectedRealityId: selected.realityId, score: selected.score, evidenceIds: selected.evidenceIds };
}
