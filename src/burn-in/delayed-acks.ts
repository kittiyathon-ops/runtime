export function delayedAcks(delayMs: number, maxDelayMs: number, evidenceIds: string[]) {
  if (delayMs < 0 || maxDelayMs < 0 || evidenceIds.length === 0) throw new Error("delayed_acks_requires_evidence");
  return { scenarioId: "delayed_acks", status: delayMs <= maxDelayMs ? "BURN_IN_CONTAINED" as const : "BURN_IN_DEGRADED" as const, delayMs, maxDelayMs, evidenceIds: [...evidenceIds] };
}
