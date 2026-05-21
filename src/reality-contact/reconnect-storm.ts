export function reconnectStorm(reconnects: number, threshold: number, evidenceIds: string[]) {
  if (reconnects < 0 || threshold < 0 || evidenceIds.length === 0) throw new Error("reconnect_storm_requires_evidence");
  return { status: reconnects > threshold ? "RECONNECT_STORM_DETECTED" as const : "RECONNECT_STORM_CLEAR" as const, reconnects, threshold, action: reconnects > threshold ? "FREEZE_EXECUTION" as const : "MONITOR" as const, evidenceIds: [...evidenceIds] };
}
