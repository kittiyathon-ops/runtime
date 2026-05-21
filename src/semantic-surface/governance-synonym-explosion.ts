export interface GovernanceTerm {
  readonly term: string;
  readonly implication: string;
  readonly evidenceIds: readonly string[];
}

export function governanceSynonymExplosion(terms: readonly GovernanceTerm[], synonymGroups: readonly (readonly string[])[], evidenceIds: string[]) {
  if (terms.length === 0 || synonymGroups.length === 0 || evidenceIds.length === 0) throw new Error("governance_synonym_explosion_requires_evidence");
  const implicationByTerm = new Map<string, string>();
  for (const term of terms) {
    if (term.term.length === 0 || term.implication.length === 0 || term.evidenceIds.length === 0) throw new Error("governance_term_requires_evidence");
    implicationByTerm.set(term.term, term.implication);
  }
  const conflicts = synonymGroups.map((group) => {
    const implications = [...new Set(group.map((term) => implicationByTerm.get(term)).filter((value): value is string => typeof value === "string"))].sort();
    return { terms: [...group].sort(), implications };
  }).filter((group) => group.implications.length > 1);
  return {
    status: conflicts.length > 0 ? "GOVERNANCE_SYNONYM_CONFLICTS_DETECTED" as const : "GOVERNANCE_SYNONYMS_BOUNDED" as const,
    conflicts,
    doctrineMutationAllowed: false,
    evidenceIds: [...evidenceIds]
  };
}
