export function primitiveAttestation(primitiveId: string, operationallyNecessary: boolean, replayPreserved: boolean, continuityPreserved: boolean, evidenceIds: string[]) {
  if (primitiveId.length === 0 || evidenceIds.length === 0) throw new Error("primitive_attestation_requires_evidence");
  const attested = operationallyNecessary && replayPreserved && continuityPreserved;
  return {
    primitiveId,
    status: attested ? "PRIMITIVE_ATTESTED" as const : "PRIMITIVE_REJECTED" as const,
    operationallyNecessary,
    replayPreserved,
    continuityPreserved,
    evidenceIds: [...evidenceIds]
  };
}
