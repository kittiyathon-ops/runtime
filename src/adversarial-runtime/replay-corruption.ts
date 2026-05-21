export function replayCorruption(expectedDigest: string, actualDigest: string, evidenceIds: string[]) {
  if (expectedDigest.length === 0 || actualDigest.length === 0 || evidenceIds.length === 0) throw new Error("replay_corruption_requires_evidence");
  const contained = expectedDigest === actualDigest;
  return { scenarioId: "replay_corruption", status: contained ? "CONTAINED" as const : "ESCALATED" as const, severity: contained ? 0 : 5, evidenceIds: [...evidenceIds] };
}
