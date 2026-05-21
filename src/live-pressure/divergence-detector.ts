export function pressureDivergenceDetector(divergence: number, maxDivergence: number, evidenceIds: string[]) {
  if (divergence < 0 || maxDivergence < 0 || evidenceIds.length === 0) throw new Error("pressure_divergence_detector_requires_evidence");
  return { status: divergence <= maxDivergence ? "DIVERGENCE_BOUNDED" as const : "DIVERGENCE_UNBOUNDED" as const, divergence, maxDivergence, evidenceIds: [...evidenceIds] };
}
