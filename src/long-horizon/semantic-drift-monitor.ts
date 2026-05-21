export function semanticDriftMonitor(drift: number, maxDrift: number, evidenceIds: string[]) {
  if (drift < 0 || maxDrift < 0 || evidenceIds.length === 0) throw new Error("semantic_drift_monitor_requires_evidence");
  return { status: drift <= maxDrift ? "SEMANTIC_DRIFT_BOUNDED" as const : "SEMANTIC_DRIFT_UNBOUNDED" as const, drift, maxDrift, evidenceIds: [...evidenceIds] };
}
