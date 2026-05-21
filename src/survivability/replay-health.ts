export function replayHealth(replayIntegrity: number, drift: number, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("replay_health_requires_evidence");
  const score = Math.max(0, replayIntegrity - drift);
  return { score, status: score >= 0.8 ? "REPLAY_HEALTHY" as const : "REPLAY_DEGRADED" as const, evidenceIds: [...evidenceIds] };
}
