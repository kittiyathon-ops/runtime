export function websocketReconnectStorms(reconnects: number, maxReconnects: number, evidenceIds: string[]) {
  if (reconnects < 0 || maxReconnects < 0 || evidenceIds.length === 0) throw new Error("websocket_reconnect_storms_requires_evidence");
  return { scenarioId: "websocket_reconnect_storms", status: reconnects <= maxReconnects ? "BURN_IN_CONTAINED" as const : "BURN_IN_DEGRADED" as const, reconnects, maxReconnects, evidenceIds: [...evidenceIds] };
}
