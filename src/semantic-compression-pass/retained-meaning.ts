export function retainedMeaning(requiredMeanings: readonly string[], retainedMeanings: readonly string[], evidenceIds: string[]) {
  if (requiredMeanings.length === 0 || evidenceIds.length === 0) throw new Error("retained_meaning_requires_evidence");
  const retained = new Set(retainedMeanings);
  const missing = [...requiredMeanings].sort().filter((meaning) => !retained.has(meaning));
  return { status: missing.length === 0 ? "MEANING_RETAINED" as const : "MEANING_LOSS" as const, missing, evidenceIds: [...evidenceIds] };
}
