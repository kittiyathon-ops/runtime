export function clockDrift(driftMs: number, maxDriftMs: number, evidenceIds: string[]) {
  if (driftMs < 0 || maxDriftMs < 0 || evidenceIds.length === 0) throw new Error("clock_drift_requires_evidence");
  return { scenarioId: "clock_drift", status: driftMs <= maxDriftMs ? "CONTAINED" as const : "ESCALATED" as const, severity: driftMs <= maxDriftMs ? 0 : 4, evidenceIds: [...evidenceIds] };
}
