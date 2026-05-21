export function realityIntegrityScore(inputs: { fracture: number; contamination: number; confidenceCollapse: number; semanticDrift: number; fragmentation: number }) {
  const values = Object.values(inputs);
  if (values.some((value) => value < 0 || value > 1 || !Number.isFinite(value))) throw new Error("reality_integrity_score_invalid");
  const corruption = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { integrityScore: 1 - corruption, corruptionScore: corruption, recommendation: corruption >= 0.7 ? "FREEZE" as const : corruption >= 0.4 ? "SAFE_MODE" as const : "CONTINUE" as const };
}
