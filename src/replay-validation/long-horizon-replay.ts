export function longHorizonReplay(durationMs: number, divergenceCount: number, evidenceIds: string[]) {
  if (durationMs < 0 || divergenceCount < 0 || evidenceIds.length === 0) throw new Error("long_horizon_replay_requires_evidence");
  return { status: divergenceCount === 0 ? "LONG_HORIZON_REPLAY_VALID" as const : "LONG_HORIZON_REPLAY_DIVERGED" as const, durationMs, divergenceCount, evidenceIds: [...evidenceIds] };
}
