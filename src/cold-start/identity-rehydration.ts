export function identityRehydration(identityLineagePresent: boolean, continuityHashVerified: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("identity_rehydration_requires_evidence");
  return { status: identityLineagePresent && continuityHashVerified ? "IDENTITY_REHYDRATED" as const : "IDENTITY_REHYDRATION_FAILED" as const, evidenceIds: [...evidenceIds] };
}
