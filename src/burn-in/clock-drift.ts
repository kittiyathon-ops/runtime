export function burnInClockDrift(driftMs: number, maxDriftMs: number, evidenceIds: string[]) {
  if (driftMs < 0 || maxDriftMs < 0 || evidenceIds.length === 0) throw new Error("burn_in_clock_drift_requires_evidence");
  return { scenarioId: "clock_drift", status: driftMs <= maxDriftMs ? "BURN_IN_CONTAINED" as const : "BURN_IN_DEGRADED" as const, driftMs, maxDriftMs, evidenceIds: [...evidenceIds] };
}
