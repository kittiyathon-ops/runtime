export function cognitiveSurfaceArea(concepts: number, interfaces: number, recursiveLinks: number, evidenceIds: string[]) {
  if (concepts < 0 || interfaces < 0 || recursiveLinks < 0 || evidenceIds.length === 0) throw new Error("cognitive_surface_area_requires_evidence");
  const score = concepts + interfaces * 2 + recursiveLinks * 3;
  return {
    status: score > 60 ? "SURFACE_AREA_EXCESSIVE" as const : score > 30 ? "SURFACE_AREA_HIGH" as const : "SURFACE_AREA_BOUNDED" as const,
    score,
    concepts,
    interfaces,
    recursiveLinks,
    evidenceIds: [...evidenceIds]
  };
}
