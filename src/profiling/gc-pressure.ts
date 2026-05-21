export function gcPressure(pauseMs: number, windowMs: number, maxPauseRatio: number, evidenceIds: string[]) {
  if (pauseMs < 0 || windowMs <= 0 || maxPauseRatio < 0 || maxPauseRatio > 1 || evidenceIds.length === 0) throw new Error("gc_pressure_requires_evidence");
  const pauseRatio = pauseMs / windowMs;
  return {
    status: pauseRatio <= maxPauseRatio ? "GC_PRESSURE_BOUNDED" as const : "GC_PRESSURE_UNSTABLE" as const,
    pauseMs,
    windowMs,
    pauseRatio,
    maxPauseRatio,
    evidenceIds: [...evidenceIds]
  };
}
