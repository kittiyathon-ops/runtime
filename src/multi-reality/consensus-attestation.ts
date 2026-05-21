export function consensusAttestation(traceId: string, consensusStatus: "CONSENSUS" | "NO_CONSENSUS", evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("consensus_attestation_requires_evidence");
  return { traceId, status: consensusStatus === "CONSENSUS" ? "ATTESTED" as const : "REJECTED" as const, evidenceIds: [...evidenceIds] };
}
