export function governanceAutoimmune(governanceBlockedLegitimateAction: boolean, overrideLoop: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("governance_autoimmune_requires_evidence");
  const active = governanceBlockedLegitimateAction || overrideLoop;
  return { status: active ? "AUTOIMMUNE_RISK" as const : "STABLE" as const, evidenceIds: [...evidenceIds] };
}
