export function venueHealth(latencyMs: number, maxLatencyMs: number, staleFeed: boolean, desynced: boolean, evidenceIds: string[]) {
  if (latencyMs < 0 || maxLatencyMs < 0 || evidenceIds.length === 0) throw new Error("venue_health_requires_evidence");
  const healthy = latencyMs <= maxLatencyMs && !staleFeed && !desynced;
  return {
    status: healthy ? "VENUE_HEALTHY" as const : "VENUE_UNSAFE" as const,
    latencyMs,
    maxLatencyMs,
    staleFeed,
    desynced,
    evidenceIds: [...evidenceIds]
  };
}
