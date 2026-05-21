export interface ProbabilisticTimelineEvent {
  seq: number;
  timestamp: number;
  probability: number;
}

export function probabilisticTimeline(events: readonly ProbabilisticTimelineEvent[]) {
  if (events.length === 0) throw new Error("probabilistic_timeline_requires_events");
  let previousSeq = -1;
  for (const event of events) {
    if (event.seq <= previousSeq) throw new Error("probabilistic_timeline_not_monotonic");
    if (event.probability < 0 || event.probability > 1) throw new Error("probability_invalid");
    previousSeq = event.seq;
  }
  return { status: "BOUNDED" as const, eventCount: events.length, probabilityMass: events.reduce((sum, event) => sum + event.probability, 0) };
}
