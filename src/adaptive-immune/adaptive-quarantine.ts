export function adaptiveQuarantine(threatKnown: boolean, continuityRisk: number, mutationRisk: number, evidenceIds: string[]) {
  if (continuityRisk < 0 || mutationRisk < 0 || evidenceIds.length === 0) throw new Error("adaptive_quarantine_requires_evidence");
  const risk = Math.min(1, continuityRisk + mutationRisk);
  return {
    status: risk >= 0.6 ? "QUARANTINE" as const : "OBSERVE" as const,
    mode: threatKnown ? "KNOWN_THREAT_PROTOCOL" as const : "NOVEL_THREAT_PROTOCOL" as const,
    risk,
    evidenceIds: [...evidenceIds]
  };
}
