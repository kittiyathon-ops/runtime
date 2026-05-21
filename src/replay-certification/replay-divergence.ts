export function replayDivergence(expectedDigest: string, actualDigest: string, lineageIds: readonly string[], contradictionIds: readonly string[], evidenceIds: string[]) {
  if (expectedDigest.length === 0 || actualDigest.length === 0 || lineageIds.length === 0 || evidenceIds.length === 0) throw new Error("replay_divergence_requires_evidence");
  const diverged = expectedDigest !== actualDigest;
  return {
    status: diverged ? "DIVERGENCE_PRESERVED_FAIL_CLOSED" as const : "NO_REPLAY_DIVERGENCE" as const,
    expectedDigest,
    actualDigest,
    lineageIds: [...lineageIds],
    contradictionIds: [...contradictionIds],
    evidenceIds: [...evidenceIds]
  };
}
