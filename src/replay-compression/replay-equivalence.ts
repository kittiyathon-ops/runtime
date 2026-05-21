export function replayEquivalence(originalDigest: string, compressedDigest: string, deterministicReplay: boolean, evidenceIds: string[]) {
  if (originalDigest.length === 0 || compressedDigest.length === 0 || evidenceIds.length === 0) throw new Error("replay_equivalence_requires_evidence");
  const equivalent = originalDigest === compressedDigest && deterministicReplay;
  return { status: equivalent ? "REPLAY_EQUIVALENT" as const : "REPLAY_NOT_EQUIVALENT" as const, equivalent, deterministicReplay, evidenceIds: [...evidenceIds] };
}
