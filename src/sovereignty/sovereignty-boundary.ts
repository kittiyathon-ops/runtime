export function sovereigntyBoundary(action: string, allowedActions: readonly string[], evidenceIds: string[]) {
  if (action.length === 0 || evidenceIds.length === 0) throw new Error("sovereignty_boundary_requires_evidence");
  return { status: allowedActions.includes(action) ? "WITHIN_BOUNDARY" as const : "BOUNDARY_VIOLATION" as const, action, evidenceIds: [...evidenceIds] };
}
