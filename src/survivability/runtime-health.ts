export function runtimeHealth(scores: readonly number[], evidenceIds: string[]) {
  if (scores.length === 0 || evidenceIds.length === 0) throw new Error("runtime_health_requires_evidence");
  const score = scores.reduce((sum, item) => sum + item, 0) / scores.length;
  return { score, status: score >= 0.7 ? "RUNTIME_HEALTHY" as const : "RUNTIME_DEGRADED" as const, evidenceIds: [...evidenceIds] };
}
