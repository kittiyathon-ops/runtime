export function authorityFracture(authorities: readonly string[], evidenceIds: string[]) {
  if (authorities.length === 0 || evidenceIds.length === 0) throw new Error("authority_fracture_requires_evidence");
  const unique = new Set(authorities);
  return { status: unique.size > 1 ? "FRACTURED" as const : "COHERENT" as const, authorityCount: unique.size, evidenceIds: [...evidenceIds] };
}
