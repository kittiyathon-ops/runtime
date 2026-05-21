export function replayDivergenceCheck(divergenceCount: number, observedDays: number, evidenceIds: string[]) {
  if (divergenceCount < 0 || observedDays < 0 || evidenceIds.length === 0) throw new Error("replay_divergence_check_requires_evidence");
  return { status: divergenceCount === 0 && observedDays >= 7 ? "NO_REPLAY_DIVERGENCE_7D_PASSED" as const : "NO_REPLAY_DIVERGENCE_7D_FAILED" as const, divergenceCount, observedDays, evidenceIds: [...evidenceIds] };
}
