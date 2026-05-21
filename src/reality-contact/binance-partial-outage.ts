export function binancePartialOutage(restAvailable: boolean, websocketAvailable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("binance_partial_outage_requires_evidence");
  const partial = restAvailable !== websocketAvailable;
  return { status: partial ? "BINANCE_PARTIAL_OUTAGE_DETECTED" as const : "BINANCE_CONNECTIVITY_COHERENT" as const, restAvailable, websocketAvailable, action: partial ? "DEGRADE_AND_RECONCILE" as const : "MONITOR" as const, evidenceIds: [...evidenceIds] };
}
