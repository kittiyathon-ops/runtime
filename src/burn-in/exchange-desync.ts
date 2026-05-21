export function exchangeDesync(driftTicks: number, maxDriftTicks: number, evidenceIds: string[]) {
  if (driftTicks < 0 || maxDriftTicks < 0 || evidenceIds.length === 0) throw new Error("exchange_desync_requires_evidence");
  return { scenarioId: "exchange_desync", status: driftTicks <= maxDriftTicks ? "BURN_IN_CONTAINED" as const : "BURN_IN_DEGRADED" as const, driftTicks, maxDriftTicks, evidenceIds: [...evidenceIds] };
}
