export function anomalyAntibodies(pattern: string, knownPatterns: readonly string[], evidenceIds: string[]) {
  if (pattern.length === 0 || evidenceIds.length === 0) throw new Error("antibody_requires_evidence");
  return { status: knownPatterns.includes(pattern) ? "MATCHED" as const : "NOVEL" as const, pattern, evidenceIds: [...evidenceIds] };
}
