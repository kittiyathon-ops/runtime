export function constitutionalBoundary(withinBoundary: boolean, governanceSelfModifying: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("adaptation_constitutional_boundary_requires_evidence");
  return { status: withinBoundary && !governanceSelfModifying ? "BOUNDARY_PRESERVED" as const : "BOUNDARY_VIOLATED" as const, evidenceIds: [...evidenceIds] };
}
