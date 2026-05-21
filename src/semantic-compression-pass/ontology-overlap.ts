export function ontologyOverlap(concepts: readonly { conceptId: string; role: string; primitives: readonly string[]; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (concepts.length === 0 || evidenceIds.length === 0) throw new Error("ontology_overlap_requires_evidence");
  const groups = new Map<string, string[]>();
  for (const concept of concepts) {
    if (concept.conceptId.length === 0 || concept.role.length === 0 || concept.evidenceIds.length === 0) throw new Error("ontology_concept_requires_evidence");
    const key = [...concept.primitives].sort().join("|") || concept.role;
    groups.set(key, [...(groups.get(key) ?? []), concept.conceptId].sort());
  }
  const overlaps = [...groups.entries()].filter(([, ids]) => ids.length > 1).map(([primitiveKey, conceptIds]) => ({ primitiveKey, conceptIds }));
  return { status: overlaps.length > 0 ? "OVERLAP_FOUND" as const : "NO_OVERLAP" as const, overlaps, evidenceIds: [...evidenceIds] };
}
