export function websocketDesync(sequenceGap: number, maxGap: number, evidenceIds: string[]) {
  if (sequenceGap < 0 || maxGap < 0 || evidenceIds.length === 0) throw new Error("websocket_desync_requires_evidence");
  return { scenarioId: "websocket_desync", status: sequenceGap <= maxGap ? "CONTAINED" as const : "ESCALATED" as const, severity: Math.max(0, sequenceGap - maxGap), evidenceIds: [...evidenceIds] };
}
