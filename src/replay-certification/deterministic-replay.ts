export function deterministicReplay(inputDigest: string, firstOutputDigest: string, secondOutputDigest: string, evidenceIds: string[]) {
  if (inputDigest.length === 0 || firstOutputDigest.length === 0 || secondOutputDigest.length === 0 || evidenceIds.length === 0) throw new Error("deterministic_replay_requires_evidence");
  return {
    status: firstOutputDigest === secondOutputDigest ? "DETERMINISTIC_REPLAY_CONFIRMED" as const : "REPLAY_DIVERGENCE_DETECTED" as const,
    inputDigest,
    firstOutputDigest,
    secondOutputDigest,
    evidenceIds: [...evidenceIds]
  };
}
