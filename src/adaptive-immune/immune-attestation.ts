export function immuneAdaptationAttestation(traceId: string, replaySafe: boolean, doctrineUnchanged: boolean, provenanceComplete: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("adaptive_immune_attestation_requires_evidence");
  const attested = replaySafe && doctrineUnchanged && provenanceComplete;
  return { traceId, status: attested ? "IMMUNE_ADAPTATION_ATTESTED" as const : "IMMUNE_ADAPTATION_REJECTED" as const, replaySafe, doctrineUnchanged, provenanceComplete, evidenceIds: [...evidenceIds] };
}
