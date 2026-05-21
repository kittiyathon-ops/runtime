export function fakePacketInjection(packetId: string, signatureValid: boolean, provenanceValid: boolean, evidenceIds: string[]) {
  if (packetId.length === 0 || evidenceIds.length === 0) throw new Error("fake_packet_injection_requires_evidence");
  const contained = !signatureValid || !provenanceValid;
  return { scenarioId: packetId, status: contained ? "CONTAINED" as const : "ESCALATED" as const, severity: contained ? 1 : 4, evidenceIds: [...evidenceIds] };
}
