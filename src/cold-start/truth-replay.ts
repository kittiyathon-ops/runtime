export function truthReplay(replayableTruthRecords: number, disputedRecordsPreserved: boolean, evidenceIds: string[]) {
  if (replayableTruthRecords < 0 || evidenceIds.length === 0) throw new Error("truth_replay_requires_evidence");
  return { status: replayableTruthRecords > 0 && disputedRecordsPreserved ? "TRUTH_REPLAYED" as const : "TRUTH_REPLAY_FAILED" as const, replayableTruthRecords, evidenceIds: [...evidenceIds] };
}
