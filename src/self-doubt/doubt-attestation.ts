export function doubtAttestation(traceId: string, safeModeDecisionReplayable: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("doubt_attestation_requires_evidence");
  return { traceId, status: safeModeDecisionReplayable ? "DOUBT_ATTESTED" as const : "DOUBT_REJECTED" as const, evidenceIds: [...evidenceIds] };
}
