export function semanticSurfaceBudget(currentConcepts: number, maxConcepts: number, currentRelations: number, maxRelations: number, evidenceIds: string[]) {
  if (currentConcepts < 0 || maxConcepts < 0 || currentRelations < 0 || maxRelations < 0 || evidenceIds.length === 0) throw new Error("semantic_surface_budget_requires_evidence");
  const bounded = currentConcepts <= maxConcepts && currentRelations <= maxRelations;
  return {
    status: bounded ? "SEMANTIC_SURFACE_BOUNDED" as const : "SEMANTIC_SURFACE_EXCEEDED" as const,
    currentConcepts,
    maxConcepts,
    currentRelations,
    maxRelations,
    evidenceIds: [...evidenceIds]
  };
}
