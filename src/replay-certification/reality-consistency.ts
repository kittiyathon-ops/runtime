export function realityConsistency(firstRealityDigest: string, secondRealityDigest: string, staleFeedBounded: boolean, evidenceIds: string[]) {
  if (firstRealityDigest.length === 0 || secondRealityDigest.length === 0 || evidenceIds.length === 0) throw new Error("reality_consistency_requires_evidence");
  return {
    status: firstRealityDigest === secondRealityDigest && staleFeedBounded ? "REALITY_CONSISTENT" as const : "REALITY_INCONSISTENT_FAIL_CLOSED" as const,
    firstRealityDigest,
    secondRealityDigest,
    staleFeedBounded,
    evidenceIds: [...evidenceIds]
  };
}
