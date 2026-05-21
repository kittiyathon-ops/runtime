export interface RealityFractureReport {
  status: "COHERENT" | "FRACTURED";
  fractureScore: number;
  reasons: string[];
  evidenceIds: string[];
}

export function realityFracture(observed: string, inferred: string, trusted: string, operational: string, evidenceIds: string[]): RealityFractureReport {
  if (evidenceIds.length === 0) throw new Error("reality_fracture_requires_evidence");
  const values = [observed, inferred, trusted, operational];
  const unique = new Set(values);
  const reasons = unique.size === 1 ? [] : ["reality_layers_diverged"];
  return { status: reasons.length === 0 ? "COHERENT" : "FRACTURED", fractureScore: (unique.size - 1) / 3, reasons, evidenceIds: [...evidenceIds] };
}
