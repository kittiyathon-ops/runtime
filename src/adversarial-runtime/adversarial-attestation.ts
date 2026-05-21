export function adversarialAttestation(traceId: string, replaySafe: boolean, chaosBounded: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("adversarial_attestation_requires_evidence");
  return { traceId, status: replaySafe && chaosBounded ? "ADVERSARIAL_ATTESTED" as const : "ADVERSARIAL_REJECTED" as const, replaySafe, chaosBounded, evidenceIds: [...evidenceIds] };
}
