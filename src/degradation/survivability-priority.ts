export function degradationSurvivabilityPriority(continuityRisk: number, capabilityValue: number, evidenceIds: string[]) {
  if (continuityRisk < 0 || capabilityValue < 0 || evidenceIds.length === 0) throw new Error("degradation_survivability_priority_requires_evidence");
  return { status: continuityRisk >= capabilityValue ? "PRESERVE_CONTINUITY" as const : "PRESERVE_CAPABILITY" as const, evidenceIds: [...evidenceIds] };
}
