export function doubtContradictionDensity(contradictions: number, observations: number, maxDensity: number, evidenceIds: string[]) {
  if (contradictions < 0 || observations <= 0 || maxDensity < 0 || evidenceIds.length === 0) throw new Error("doubt_contradiction_density_requires_evidence");
  const density = contradictions / observations;
  return { status: density > maxDensity ? "CONTRADICTION_UNSAFE" as const : "CONTRADICTION_BOUNDED" as const, density, evidenceIds: [...evidenceIds] };
}
