export function legitimacyAttestation(traceId: string, legitimacyScore: number, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("legitimacy_attestation_requires_evidence");
  if (legitimacyScore < 0 || legitimacyScore > 1) throw new Error("legitimacy_score_invalid");
  return { traceId, status: legitimacyScore >= 0.75 ? "LEGITIMATE" as const : "REJECTED" as const, legitimacyScore, evidenceIds: [...evidenceIds] };
}
