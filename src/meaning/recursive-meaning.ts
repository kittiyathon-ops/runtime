export function recursiveMeaning(depth: number, maxDepth: number, evidenceIds: string[]) {
  if (maxDepth <= 0 || depth < 0 || evidenceIds.length === 0) throw new Error("recursive_meaning_requires_evidence");
  return { status: depth <= maxDepth ? "BOUNDED" as const : "UNBOUNDED" as const, depth, maxDepth, evidenceIds: [...evidenceIds] };
}
