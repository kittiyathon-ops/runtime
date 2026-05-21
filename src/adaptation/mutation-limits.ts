export function mutationLimits(scope: number, maxScope: number, evidenceIds: string[]) {
  if (scope < 0 || maxScope < 0 || evidenceIds.length === 0) throw new Error("mutation_limits_requires_evidence");
  return { status: scope <= maxScope ? "MUTATION_BOUNDED" as const : "MUTATION_EXCEEDED" as const, scope, maxScope, evidenceIds: [...evidenceIds] };
}
