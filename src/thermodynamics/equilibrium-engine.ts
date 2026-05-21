export function equilibriumEngine(inputs: { entropy: number; heat: number; energy: number; cost: number; evidenceIds: string[] }) {
  if (inputs.evidenceIds.length === 0) throw new Error("equilibrium_requires_evidence");
  const load = inputs.entropy + inputs.heat + inputs.cost;
  return { status: inputs.energy >= load ? "EQUILIBRIUM" as const : "DESTABILIZED" as const, load, energy: inputs.energy, evidenceIds: [...inputs.evidenceIds] };
}
