export function replayGrowthMonitor(eventsPerDay: number, maxEventsPerDay: number, evidenceIds: string[]) {
  if (eventsPerDay < 0 || maxEventsPerDay < 0 || evidenceIds.length === 0) throw new Error("replay_growth_monitor_requires_evidence");
  return { status: eventsPerDay <= maxEventsPerDay ? "REPLAY_GROWTH_BOUNDED" as const : "REPLAY_GROWTH_UNBOUNDED" as const, eventsPerDay, maxEventsPerDay, evidenceIds: [...evidenceIds] };
}
