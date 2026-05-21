export function survivabilityEnergy(coherenceEnergy: number, entropyPressure: number, evidenceIds: string[]) {
  if (coherenceEnergy < 0 || entropyPressure < 0 || evidenceIds.length === 0) throw new Error("survivability_energy_requires_evidence");
  const remaining = coherenceEnergy - entropyPressure;
  return { remaining, status: remaining >= 0 ? "SURVIVABLE" as const : "DEPLETED" as const, evidenceIds: [...evidenceIds] };
}
