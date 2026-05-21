export function cognitiveEntropy(semanticBranches: number, unresolvedMeanings: number, evidenceIds: string[]) {
  if (semanticBranches < 0 || unresolvedMeanings < 0 || evidenceIds.length === 0) throw new Error("cognitive_entropy_requires_evidence");
  const entropy = semanticBranches + unresolvedMeanings;
  return { entropy, status: entropy > 10 ? "SATURATED" as const : "BOUNDED" as const, evidenceIds: [...evidenceIds] };
}
