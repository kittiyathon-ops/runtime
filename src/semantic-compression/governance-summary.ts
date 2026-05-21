export function governanceSummary(policyIds: readonly string[], outcomes: readonly string[], evidenceIds: readonly string[]): { summary: string; evidenceIds: string[] } {
  if (policyIds.length === 0 || outcomes.length === 0 || evidenceIds.length === 0) throw new Error("governance_summary_requires_inputs");
  return { summary: `${Array.from(new Set(policyIds)).sort().join(",")}:${Array.from(new Set(outcomes)).sort().join(",")}`, evidenceIds: [...evidenceIds] };
}
