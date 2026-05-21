import type { IncidentReplaySnapshot } from "./replay-snapshot.js";
import type { IncidentTimelineEntry } from "./incident-timeline.js";

export interface IncidentRecord {
  readonly incidentId: string;
  readonly traceId: string;
  readonly timeline: readonly IncidentTimelineEntry[];
  readonly rootCause: string;
  readonly impact: string;
  readonly recoveryAction: string;
  readonly replaySnapshot: IncidentReplaySnapshot;
  readonly attestation: string;
  readonly operatorNotes: readonly string[];
  readonly evidenceIds: readonly string[];
}

export class IncidentJournal {
  private readonly records: IncidentRecord[] = [];

  append(record: IncidentRecord): readonly IncidentRecord[] {
    if (record.incidentId.length === 0 || record.traceId.length === 0 || record.timeline.length === 0 || record.rootCause.length === 0 || record.impact.length === 0 || record.recoveryAction.length === 0 || record.replaySnapshot.snapshotId.length === 0 || record.attestation.length === 0 || record.evidenceIds.length === 0) {
      throw new Error("incident_journal_requires_complete_record");
    }
    if (this.records.some((existing) => existing.incidentId === record.incidentId)) throw new Error("incident_journal_is_append_only");
    this.records.push({ ...record, timeline: [...record.timeline], operatorNotes: [...record.operatorNotes], evidenceIds: [...record.evidenceIds] });
    return this.list();
  }

  list(): readonly IncidentRecord[] {
    return this.records.map((record) => ({ ...record, timeline: [...record.timeline], operatorNotes: [...record.operatorNotes], evidenceIds: [...record.evidenceIds] }));
  }
}
