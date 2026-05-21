export function boundedRecursion(depth: number, maxDepth: number, evidenceIds: string[]) {
  if (depth < 0 || maxDepth < 0 || evidenceIds.length === 0) throw new Error("bounded_recursion_requires_evidence");
  return { invariant: "bounded_recursion" as const, status: depth <= maxDepth ? "PRESERVED" as const : "VIOLATED" as const, evidenceIds: [...evidenceIds] };
}
