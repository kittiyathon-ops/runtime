export function existentialBoundary(required: readonly string[], present: readonly string[], evidenceIds: string[]) {
  if (required.length === 0 || evidenceIds.length === 0) throw new Error("existential_boundary_requires_evidence");
  const have = new Set(present);
  const missing = required.filter((item) => !have.has(item));
  return { status: missing.length === 0 ? "INTACT" as const : "BREACHED" as const, missing, evidenceIds: [...evidenceIds] };
}
