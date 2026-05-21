export function continuityScore(identity: number, governance: number, lineage: number, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("continuity_score_requires_evidence");
  const score = (identity + governance + lineage) / 3;
  return { score, status: score >= 0.7 ? "CONTINUITY_HEALTHY" as const : "CONTINUITY_DEGRADED" as const, evidenceIds: [...evidenceIds] };
}
