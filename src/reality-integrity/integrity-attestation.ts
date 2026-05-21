export function integrityAttestation(traceId: string, integrityScore: number, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("integrity_attestation_requires_evidence");
  if (integrityScore < 0 || integrityScore > 1) throw new Error("integrity_score_invalid");
  return { traceId, status: integrityScore >= 0.7 ? "ATTESTED" as const : "REJECTED" as const, integrityScore, evidenceIds: [...evidenceIds] };
}
