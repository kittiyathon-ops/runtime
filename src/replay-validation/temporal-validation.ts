export function replayTemporalValidation(monotonic: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("replay_temporal_validation_requires_evidence");
  return { status: monotonic ? "TEMPORAL_REPLAY_VALID" as const : "TEMPORAL_REPLAY_INVALID" as const, evidenceIds: [...evidenceIds] };
}
