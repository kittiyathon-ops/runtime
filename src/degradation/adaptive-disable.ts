export function adaptiveDisable(lowTrust: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("adaptive_disable_requires_evidence");
  return { status: lowTrust ? "DISABLE_ADAPTATION" as const : "ADAPTATION_ENABLED" as const, evidenceIds: [...evidenceIds] };
}
