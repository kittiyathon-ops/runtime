export function recoveryLatency(latencyMs: number, maxLatencyMs: number, coldStart: boolean, evidenceIds: string[]) {
  if (latencyMs < 0 || maxLatencyMs < 0 || evidenceIds.length === 0) throw new Error("recovery_latency_requires_evidence");
  return {
    status: latencyMs <= maxLatencyMs ? "RECOVERY_LATENCY_BOUNDED" as const : "COLD_START_DEGRADATION_DETECTED" as const,
    latencyMs,
    maxLatencyMs,
    coldStart,
    evidenceIds: [...evidenceIds]
  };
}
