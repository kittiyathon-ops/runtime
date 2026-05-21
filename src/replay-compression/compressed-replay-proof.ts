export function compressedReplayProof(proofId: string, boundaryPreserved: boolean, causalMeaningPreserved: boolean, replayEquivalent: boolean, evidenceIds: string[]) {
  if (proofId.length === 0 || evidenceIds.length === 0) throw new Error("compressed_replay_proof_requires_evidence");
  const certified = boundaryPreserved && causalMeaningPreserved && replayEquivalent;
  return { proofId, status: certified ? "COMPRESSED_REPLAY_PROVEN" as const : "COMPRESSED_REPLAY_PROOF_REJECTED" as const, certified, evidenceIds: [...evidenceIds] };
}
