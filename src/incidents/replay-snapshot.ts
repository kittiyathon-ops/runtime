export interface IncidentReplaySnapshot {
  readonly snapshotId: string;
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly replayHash: string;
  readonly evidenceIds: readonly string[];
}

export function replaySnapshot(snapshot: IncidentReplaySnapshot, evidenceIds: string[]) {
  if (snapshot.snapshotId.length === 0 || snapshot.fromSeq < 0 || snapshot.toSeq < snapshot.fromSeq || snapshot.replayHash.length === 0 || snapshot.evidenceIds.length === 0 || evidenceIds.length === 0) {
    throw new Error("incident_replay_snapshot_requires_evidence");
  }
  return { status: "INCIDENT_REPLAY_SNAPSHOT_CAPTURED" as const, snapshot: { ...snapshot, evidenceIds: [...snapshot.evidenceIds] }, evidenceIds: [...evidenceIds] };
}
