export function replayGrowth(inputEvents: number, replayedEvents: number, maxReplayRatio: number, evidenceIds: string[]) {
  if (inputEvents <= 0 || replayedEvents < 0 || maxReplayRatio < 1 || evidenceIds.length === 0) throw new Error("replay_growth_requires_evidence");
  const replayRatio = replayedEvents / inputEvents;
  return {
    status: replayRatio <= maxReplayRatio ? "REPLAY_GROWTH_BOUNDED" as const : "REPLAY_EXPLOSION_DETECTED" as const,
    inputEvents,
    replayedEvents,
    replayRatio,
    maxReplayRatio,
    evidenceIds: [...evidenceIds]
  };
}
