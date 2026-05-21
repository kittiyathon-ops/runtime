export function conflictingTruths(claims: readonly { claimId: string; value: string; evidenceIds: string[] }[]) {
  if (claims.length === 0) throw new Error("conflicting_truths_requires_claims");
  const values = new Set(claims.map((claim) => claim.value));
  return { status: values.size > 1 ? "CONFLICTING" as const : "ALIGNED" as const, claimIds: claims.map((claim) => claim.claimId), evidenceIds: claims.flatMap((claim) => claim.evidenceIds) };
}
