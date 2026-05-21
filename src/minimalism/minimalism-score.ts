export function minimalismScore(subsystemId: string, valueScore: number, costScore: number, evidenceIds: string[]) {
  if (subsystemId.length === 0 || valueScore < 0 || costScore < 0 || evidenceIds.length === 0) throw new Error("minimalism_score_requires_evidence");
  const netScore = valueScore - costScore;
  return { subsystemId, status: netScore >= 0 ? "SUBSYSTEM_JUSTIFIED" as const : "SUBSYSTEM_SELF_WEIGHT_DETECTED" as const, valueScore, costScore, netScore, evidenceIds: [...evidenceIds] };
}
