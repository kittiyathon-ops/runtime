export function replaySurvivability(expectedDigest: string, actualDigest: string, divergence: number, maxDivergence: number, evidenceIds: string[]) {
  if (expectedDigest.length === 0 || actualDigest.length === 0 || divergence < 0 || maxDivergence < 0 || evidenceIds.length === 0) throw new Error("replay_survivability_requires_evidence");
  const digestMatch = expectedDigest === actualDigest;
  const bounded = divergence <= maxDivergence;
  return { status: digestMatch || bounded ? "REPLAY_SURVIVED" as const : "REPLAY_UNSURVIVABLE" as const, digestMatch, divergence, maxDivergence, evidenceIds: [...evidenceIds] };
}
