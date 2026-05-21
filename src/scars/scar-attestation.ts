export function scarAttestation(traceId: string, scarRecorded: boolean, mutationBlocked: boolean, approvalRequired: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("scar_attestation_requires_evidence");
  return { traceId, status: scarRecorded && mutationBlocked && approvalRequired ? "SCAR_ATTESTED" as const : "SCAR_ATTESTATION_REJECTED" as const, doctrineMutated: false, evidenceIds: [...evidenceIds] };
}
