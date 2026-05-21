export function constitutionalRecursion(path: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("constitutional_recursion_requires_evidence");
  const seen = new Set<string>();
  for (const node of path) {
    if (seen.has(node)) return { status: "RECURSIVE" as const, repeatedNode: node, evidenceIds: [...evidenceIds] };
    seen.add(node);
  }
  return { status: "FINITE" as const, evidenceIds: [...evidenceIds] };
}
