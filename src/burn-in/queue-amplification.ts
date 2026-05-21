export function queueAmplification(inputDepth: number, outputDepth: number, maxAmplification: number, evidenceIds: string[]) {
  if (inputDepth <= 0 || outputDepth < 0 || maxAmplification < 1 || evidenceIds.length === 0) throw new Error("queue_amplification_requires_evidence");
  const amplification = outputDepth / inputDepth;
  return { scenarioId: "queue_amplification", status: amplification <= maxAmplification ? "BURN_IN_CONTAINED" as const : "BURN_IN_DEGRADED" as const, amplification, maxAmplification, evidenceIds: [...evidenceIds] };
}
