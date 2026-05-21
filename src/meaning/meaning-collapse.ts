export function meaningCollapse(coherenceScore: number, evidenceIds: string[]) {
  if (coherenceScore < 0 || coherenceScore > 1 || evidenceIds.length === 0) throw new Error("meaning_collapse_requires_evidence");
  return { status: coherenceScore < 0.4 ? "COLLAPSED" as const : "STABLE" as const, coherenceScore, evidenceIds: [...evidenceIds] };
}
