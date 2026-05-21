export function coherenceEnergy(available: number, required: number, evidenceIds: string[]) {
  if (available < 0 || required < 0 || evidenceIds.length === 0) throw new Error("coherence_energy_requires_evidence");
  return { status: available >= required ? "SUFFICIENT" as const : "EXHAUSTED" as const, available, required, evidenceIds: [...evidenceIds] };
}
