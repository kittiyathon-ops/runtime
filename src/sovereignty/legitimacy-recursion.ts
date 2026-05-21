export function legitimacyRecursion(path: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("legitimacy_recursion_requires_evidence");
  const seen = new Set<string>();
  for (const item of path) {
    if (seen.has(item)) return { status: "RECURSIVE" as const, repeated: item, evidenceIds: [...evidenceIds] };
    seen.add(item);
  }
  return { status: "FINITE" as const, evidenceIds: [...evidenceIds] };
}
