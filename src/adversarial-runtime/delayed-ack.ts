export function delayedAck(delayMs: number, maxDelayMs: number, evidenceIds: string[]) {
  if (delayMs < 0 || maxDelayMs < 0 || evidenceIds.length === 0) throw new Error("delayed_ack_requires_evidence");
  return { scenarioId: "delayed_ack", status: delayMs <= maxDelayMs ? "CONTAINED" as const : "ESCALATED" as const, severity: delayMs <= maxDelayMs ? 0 : 2, evidenceIds: [...evidenceIds] };
}
