export function continuityDefense(identityDrift: number, lineageBreaks: number, existentialPressure: number, evidenceIds: string[]) {
  if (identityDrift < 0 || lineageBreaks < 0 || existentialPressure < 0 || evidenceIds.length === 0) throw new Error("continuity_defense_requires_evidence");
  const score = Math.min(1, identityDrift + lineageBreaks * 0.25 + existentialPressure);
  return {
    status: score >= 0.7 ? "CONTINUITY_UNDER_ATTACK" as const : "CONTINUITY_DEFENDED" as const,
    score,
    response: score >= 0.7 ? "preserve_identity_and_halt_mutation" as const : "monitor_continuity" as const,
    evidenceIds: [...evidenceIds]
  };
}
