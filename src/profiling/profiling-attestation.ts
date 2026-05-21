export function profilingAttestation(traceId: string, bounded: boolean, appendOnly: boolean, deterministic: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("profiling_attestation_requires_evidence");
  return {
    traceId,
    status: bounded && appendOnly && deterministic ? "PROFILING_ATTESTED" as const : "PROFILING_REJECTED" as const,
    evidenceIds: [...evidenceIds]
  };
}
