export function doctrineAdjustmentCandidate(candidateId: string, scarId: string, proposedAdjustment: string, replaySafe: boolean, evidenceIds: string[]) {
  if (candidateId.length === 0 || scarId.length === 0 || proposedAdjustment.length === 0 || evidenceIds.length === 0) throw new Error("doctrine_adjustment_candidate_requires_evidence");
  return { candidateId, scarId, status: replaySafe ? "DOCTRINE_ADJUSTMENT_CANDIDATE_RECOMMENDED_ONLY" as const : "DOCTRINE_ADJUSTMENT_CANDIDATE_BLOCKED" as const, proposedAdjustment, doctrineMutated: false, evidenceIds: [...evidenceIds] };
}
