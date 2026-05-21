export function immuneAttestation(traceId: string, action: "ALLOW" | "THROTTLE_COGNITION" | "QUARANTINE", evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("immune_attestation_requires_evidence");
  return { traceId, status: action === "ALLOW" ? "CLEAR" as const : "CONTAINED" as const, action, evidenceIds: [...evidenceIds] };
}
