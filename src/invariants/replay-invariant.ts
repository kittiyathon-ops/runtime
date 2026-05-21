export function replayInvariant(expectedDigest: string, actualDigest: string, evidenceIds: string[]) {
  if (expectedDigest.length === 0 || actualDigest.length === 0 || evidenceIds.length === 0) throw new Error("replay_invariant_requires_evidence");
  return { invariant: "replay_consistency" as const, status: expectedDigest === actualDigest ? "PRESERVED" as const : "VIOLATED" as const, evidenceIds: [...evidenceIds] };
}
