export function latencySpike(latencyMs: number, maxLatencyMs: number, evidenceIds: string[]) {
  if (latencyMs < 0 || maxLatencyMs < 0 || evidenceIds.length === 0) throw new Error("latency_spike_requires_evidence");
  return { status: latencyMs > maxLatencyMs ? "LATENCY_SPIKE_DETECTED" as const : "LATENCY_WITHIN_BOUND" as const, latencyMs, maxLatencyMs, evidenceIds: [...evidenceIds] };
}
