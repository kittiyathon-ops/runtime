export function ntpDrift(driftMs: number, maxDriftMs: number, evidenceIds: string[]) {
  if (driftMs < 0 || maxDriftMs < 0 || evidenceIds.length === 0) throw new Error("ntp_drift_requires_evidence");
  return { status: driftMs > maxDriftMs ? "NTP_DRIFT_DETECTED" as const : "NTP_DRIFT_BOUNDED" as const, driftMs, maxDriftMs, evidenceIds: [...evidenceIds] };
}
