export function horizonAttestation(traceId: string, reportStatus: string, horizonDays: number, evidenceIds: string[]) {
  if (traceId.length === 0 || horizonDays <= 0 || evidenceIds.length === 0) throw new Error("horizon_attestation_requires_evidence");
  return { traceId, status: reportStatus === "HORIZON_SURVIVABILITY_PRESERVED" ? "HORIZON_ATTESTED" as const : "HORIZON_ATTESTATION_REJECTED" as const, horizonDays, evidenceIds: [...evidenceIds] };
}
