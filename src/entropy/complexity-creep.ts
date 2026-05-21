export function complexityCreep(currentComplexity: number, baselineComplexity: number, maxGrowth: number, evidenceIds: string[]) {
  if (currentComplexity < 0 || baselineComplexity < 0 || maxGrowth < 0 || evidenceIds.length === 0) throw new Error("complexity_creep_requires_evidence");
  const growth = currentComplexity - baselineComplexity;
  return { status: growth > maxGrowth ? "COMPLEXITY_CREEP" as const : "COMPLEXITY_BOUNDED" as const, growth, evidenceIds: [...evidenceIds] };
}
