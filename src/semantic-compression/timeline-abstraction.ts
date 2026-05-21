export interface TimelineAbstract {
  start: number;
  end: number;
  eventCount: number;
  evidenceIds: string[];
}

export function timelineAbstraction(timestamps: readonly number[], evidenceIds: readonly string[]): TimelineAbstract {
  if (timestamps.length === 0 || evidenceIds.length === 0) throw new Error("timeline_abstraction_requires_inputs");
  return { start: Math.min(...timestamps), end: Math.max(...timestamps), eventCount: timestamps.length, evidenceIds: [...evidenceIds] };
}
