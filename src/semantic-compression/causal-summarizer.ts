export function causalSummarizer(causes: readonly string[], evidenceIds: readonly string[]): { summary: string; evidenceIds: string[] } {
  if (causes.length === 0 || evidenceIds.length === 0) throw new Error("causal_summary_requires_lineage");
  return { summary: [...causes].sort().join(" -> "), evidenceIds: [...evidenceIds] };
}
