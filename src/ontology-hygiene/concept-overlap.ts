export interface OntologyConcept {
  readonly conceptId: string;
  readonly primitives: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface ConceptOverlapFinding {
  readonly conceptA: string;
  readonly conceptB: string;
  readonly overlapRatio: number;
  readonly sharedPrimitives: readonly string[];
}

export function conceptOverlap(concepts: readonly OntologyConcept[], overlapThreshold: number, evidenceIds: string[]) {
  if (concepts.length < 2 || overlapThreshold < 0 || overlapThreshold > 1 || evidenceIds.length === 0) throw new Error("concept_overlap_requires_evidence");
  const findings: ConceptOverlapFinding[] = [];
  const sorted = [...concepts].sort((a, b) => a.conceptId.localeCompare(b.conceptId));

  for (const concept of sorted) {
    if (concept.conceptId.length === 0 || concept.primitives.length === 0 || concept.evidenceIds.length === 0) throw new Error("ontology_concept_requires_evidence");
  }

  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      const a = sorted[left]!;
      const b = sorted[right]!;
      const aPrimitives = new Set(a.primitives);
      const bPrimitives = new Set(b.primitives);
      const sharedPrimitives = [...aPrimitives].filter((primitive) => bPrimitives.has(primitive)).sort();
      const unionSize = new Set([...a.primitives, ...b.primitives]).size;
      const overlapRatio = unionSize === 0 ? 0 : sharedPrimitives.length / unionSize;
      if (overlapRatio >= overlapThreshold) findings.push({ conceptA: a.conceptId, conceptB: b.conceptId, overlapRatio, sharedPrimitives });
    }
  }

  return {
    status: findings.length > 0 ? "CONCEPT_OVERLAP_DETECTED" as const : "CONCEPT_OVERLAP_CLEAR" as const,
    recommendationOnly: true,
    findings,
    evidenceIds: [...evidenceIds]
  };
}
