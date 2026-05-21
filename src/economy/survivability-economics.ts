export function survivabilityEconomics(continuityValue: number, complexityCost: number, evidenceIds: string[]) {
  if (continuityValue < 0 || complexityCost < 0 || evidenceIds.length === 0) throw new Error("survivability_economics_requires_evidence");
  const returnOnComplexity = complexityCost === 0 ? continuityValue : continuityValue / complexityCost;
  return { status: returnOnComplexity >= 1 ? "SURVIVABILITY_EFFICIENT" as const : "SURVIVABILITY_INEFFICIENT" as const, returnOnComplexity, evidenceIds: [...evidenceIds] };
}
