export function causalCollapse(causes: readonly { causeId: string; effectCount: number; evidenceIds: readonly string[] }[], evidenceIds: string[]) {
  if (causes.length === 0 || evidenceIds.length === 0) throw new Error("causal_collapse_requires_evidence");
  const primaryCause = [...causes].sort((a, b) => b.effectCount - a.effectCount || a.causeId.localeCompare(b.causeId))[0]!;
  if (primaryCause.causeId.length === 0 || primaryCause.evidenceIds.length === 0) throw new Error("causal_collapse_cause_requires_evidence");
  return { status: "CAUSAL_COLLAPSE_SUMMARIZED" as const, primaryCause: primaryCause.causeId, effectCount: primaryCause.effectCount, evidenceIds: [...evidenceIds] };
}
