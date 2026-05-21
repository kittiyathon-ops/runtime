export function semanticSurfaceArea(conceptCount: number, overlapCount: number, duplicateCount: number, operatorLoad: number, evidenceIds: string[]) {
  if ([conceptCount, overlapCount, duplicateCount, operatorLoad].some((value) => value < 0) || evidenceIds.length === 0) throw new Error("semantic_surface_area_pass_requires_evidence");
  const score = conceptCount + overlapCount * 2 + duplicateCount * 3 + operatorLoad;
  return { status: score > 80 ? "SURFACE_AREA_EXCESSIVE" as const : score > 40 ? "SURFACE_AREA_HIGH" as const : "SURFACE_AREA_BOUNDED" as const, score, evidenceIds: [...evidenceIds] };
}
