export function kernelIdentity(identityLineage: readonly string[], currentIdentity: string, evidenceIds: string[]) {
  if (identityLineage.length === 0 || currentIdentity.length === 0 || evidenceIds.length === 0) throw new Error("kernel_identity_requires_evidence");
  const continuityPreserved = identityLineage[identityLineage.length - 1] === currentIdentity;
  return {
    status: continuityPreserved ? "IDENTITY_CONTINUITY_PRESERVED" as const : "IDENTITY_CONTINUITY_BROKEN" as const,
    currentIdentity,
    lineageLength: identityLineage.length,
    continuityPreserved,
    evidenceIds: [...evidenceIds]
  };
}
