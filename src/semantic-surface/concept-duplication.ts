export interface SemanticConcept {
  readonly conceptId: string;
  readonly signature: string;
  readonly evidenceIds: readonly string[];
}

export function conceptDuplication(concepts: readonly SemanticConcept[], evidenceIds: string[]) {
  if (concepts.length === 0 || evidenceIds.length === 0) throw new Error("concept_duplication_requires_evidence");
  const bySignature = new Map<string, string[]>();
  for (const concept of concepts) {
    if (concept.conceptId.length === 0 || concept.signature.length === 0 || concept.evidenceIds.length === 0) throw new Error("semantic_concept_requires_evidence");
    bySignature.set(concept.signature, [...(bySignature.get(concept.signature) ?? []), concept.conceptId].sort());
  }
  const duplicates = [...bySignature.entries()].filter(([, ids]) => ids.length > 1).map(([signature, ids]) => ({ signature, ids }));
  return { status: duplicates.length > 0 ? "CONCEPT_DUPLICATION_DETECTED" as const : "CONCEPT_DUPLICATION_CLEAR" as const, duplicates, recommendationOnly: true, evidenceIds: [...evidenceIds] };
}
