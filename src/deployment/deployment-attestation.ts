export function deploymentAttestation(traceId: string, gated: boolean, evidencePreserved: boolean, overridePreserved: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("deployment_attestation_requires_evidence");
  return {
    traceId,
    status: gated && evidencePreserved && overridePreserved ? "DEPLOYMENT_ATTESTED" as const : "DEPLOYMENT_REJECTED" as const,
    evidenceIds: [...evidenceIds]
  };
}
