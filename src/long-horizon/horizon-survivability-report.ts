export interface HorizonMonitorResult {
  readonly monitorId: string;
  readonly status: string;
  readonly evidenceIds: readonly string[];
}

export function horizonSurvivabilityReport(results: readonly HorizonMonitorResult[], evidenceIds: string[]) {
  if (results.length === 0 || evidenceIds.length === 0) throw new Error("horizon_survivability_report_requires_evidence");
  const failing = [...results].filter((result) => {
    if (result.monitorId.length === 0 || result.evidenceIds.length === 0) throw new Error("horizon_monitor_result_requires_evidence");
    return !result.status.endsWith("_BOUNDED") && result.status !== "LONG_HORIZON_SURVIVABLE";
  }).map((result) => result.monitorId).sort();
  return { status: failing.length === 0 ? "HORIZON_SURVIVABILITY_PRESERVED" as const : "HORIZON_SURVIVABILITY_DEGRADED" as const, failing, evidenceIds: [...evidenceIds] };
}
