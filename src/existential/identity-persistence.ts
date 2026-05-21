export function identityPersistence(previousIdentity: string, currentIdentity: string, evidenceIds: string[]) {
  if (previousIdentity.length === 0 || currentIdentity.length === 0 || evidenceIds.length === 0) throw new Error("identity_persistence_requires_evidence");
  return { status: previousIdentity === currentIdentity ? "PERSISTENT" as const : "DISCONTINUOUS" as const, evidenceIds: [...evidenceIds] };
}
