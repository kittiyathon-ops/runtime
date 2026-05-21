export function immuneLearning(previousDefensePatterns: readonly string[], successfulPattern: string, evidenceIds: string[]) {
  if (successfulPattern.length === 0 || evidenceIds.length === 0) throw new Error("immune_learning_requires_evidence");
  const patterns = Array.from(new Set([...previousDefensePatterns, successfulPattern])).sort();
  return {
    status: previousDefensePatterns.includes(successfulPattern) ? "PATTERN_REINFORCED" as const : "PATTERN_LEARNED" as const,
    patterns,
    doctrineMutated: false as const,
    evidenceIds: [...evidenceIds]
  };
}
