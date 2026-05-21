export function ideologicalConflict(doctrines: readonly string[], evidenceIds: string[]) {
  if (doctrines.length === 0 || evidenceIds.length === 0) throw new Error("ideological_conflict_requires_evidence");
  const count = new Set(doctrines).size;
  return { status: count > 1 ? "CONFLICT" as const : "ALIGNED" as const, doctrineCount: count, evidenceIds: [...evidenceIds] };
}
