export interface IncidentTimelineEntry {
  readonly seq: number;
  readonly timestampMs: number;
  readonly event: string;
  readonly evidenceIds: readonly string[];
}

export function incidentTimeline(entries: readonly IncidentTimelineEntry[], evidenceIds: string[]) {
  if (entries.length === 0 || evidenceIds.length === 0) throw new Error("incident_timeline_requires_evidence");
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  for (let index = 0; index < sorted.length; index += 1) {
    const entry = sorted[index]!;
    if (entry.seq < 0 || entry.timestampMs < 0 || entry.event.length === 0 || entry.evidenceIds.length === 0) throw new Error("incident_timeline_entry_requires_evidence");
    if (index > 0 && entry.seq <= sorted[index - 1]!.seq) throw new Error("incident_timeline_requires_monotonic_sequence");
  }
  return { status: "INCIDENT_TIMELINE_RECORDED" as const, entries: sorted, evidenceIds: [...evidenceIds] };
}
