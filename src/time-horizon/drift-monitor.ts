export function horizonDriftMonitor(identityDrift: number, maxDrift: number, evidenceIds: string[]) {
  if (identityDrift < 0 || maxDrift < 0 || evidenceIds.length === 0) throw new Error("horizon_drift_monitor_requires_evidence");
  return { status: identityDrift <= maxDrift ? "DRIFT_BOUNDED" as const : "DRIFT_UNBOUNDED" as const, identityDrift, maxDrift, evidenceIds: [...evidenceIds] };
}
