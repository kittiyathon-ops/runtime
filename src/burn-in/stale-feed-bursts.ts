export function staleFeedBursts(staleBursts: number, maxBursts: number, evidenceIds: string[]) {
  if (staleBursts < 0 || maxBursts < 0 || evidenceIds.length === 0) throw new Error("stale_feed_bursts_requires_evidence");
  return { scenarioId: "stale_feed_bursts", status: staleBursts <= maxBursts ? "BURN_IN_CONTAINED" as const : "BURN_IN_DEGRADED" as const, staleBursts, maxBursts, evidenceIds: [...evidenceIds] };
}
