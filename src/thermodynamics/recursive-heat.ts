export function recursiveHeat(recursionDepth: number, branchingFactor: number, evidenceIds: string[]) {
  if (recursionDepth < 0 || branchingFactor < 0 || evidenceIds.length === 0) throw new Error("recursive_heat_requires_evidence");
  const heat = recursionDepth * branchingFactor;
  return { heat, status: heat > 10 ? "OVERHEATED" as const : "COOL" as const, evidenceIds: [...evidenceIds] };
}
