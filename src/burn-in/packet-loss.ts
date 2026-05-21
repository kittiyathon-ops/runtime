export function packetLoss(lostPackets: number, maxLostPackets: number, evidenceIds: string[]) {
  if (lostPackets < 0 || maxLostPackets < 0 || evidenceIds.length === 0) throw new Error("packet_loss_requires_evidence");
  return { scenarioId: "packet_loss", status: lostPackets <= maxLostPackets ? "BURN_IN_CONTAINED" as const : "BURN_IN_DEGRADED" as const, lostPackets, maxLostPackets, evidenceIds: [...evidenceIds] };
}
