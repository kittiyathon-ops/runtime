export function replayFloods(events: number, maxEvents: number, evidenceIds: string[]) {
  if (events < 0 || maxEvents < 0 || evidenceIds.length === 0) throw new Error("replay_floods_requires_evidence");
  return { scenarioId: "replay_floods", status: events <= maxEvents ? "BURN_IN_CONTAINED" as const : "BURN_IN_DEGRADED" as const, events, maxEvents, evidenceIds: [...evidenceIds] };
}
