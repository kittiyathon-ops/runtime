export function timelineRecovery(monotonic: boolean, eventCount: number, evidenceIds: string[]) {
  if (eventCount < 0 || evidenceIds.length === 0) throw new Error("timeline_recovery_requires_evidence");
  return { status: monotonic && eventCount > 0 ? "TIMELINE_RECOVERED" as const : "TIMELINE_RECOVERY_FAILED" as const, eventCount, evidenceIds: [...evidenceIds] };
}
