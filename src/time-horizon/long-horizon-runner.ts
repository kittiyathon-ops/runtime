export function longHorizonRunner(durationMs: number, minDurationMs: number, replaySafe: boolean, evidenceIds: string[]) {
  if (durationMs < 0 || minDurationMs < 0 || evidenceIds.length === 0) throw new Error("long_horizon_runner_requires_evidence");
  return { status: durationMs >= minDurationMs && replaySafe ? "HORIZON_COMPLETED" as const : "HORIZON_FAILED" as const, durationMs, minDurationMs, evidenceIds: [...evidenceIds] };
}
