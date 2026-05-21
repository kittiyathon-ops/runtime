export function collapseProximity(entropy: number, energyDeficit: number, evidenceIds: string[]) {
  if (entropy < 0 || energyDeficit < 0 || evidenceIds.length === 0) throw new Error("collapse_proximity_requires_evidence");
  const proximity = Math.min(1, entropy + energyDeficit);
  return { proximity, status: proximity >= 0.8 ? "IMMINENT" as const : "DISTANT" as const, evidenceIds: [...evidenceIds] };
}
