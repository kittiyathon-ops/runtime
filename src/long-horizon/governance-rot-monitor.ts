export function governanceRotMonitor(rotScore: number, maxRotScore: number, evidenceIds: string[]) {
  if (rotScore < 0 || maxRotScore < 0 || evidenceIds.length === 0) throw new Error("governance_rot_monitor_requires_evidence");
  return { status: rotScore <= maxRotScore ? "GOVERNANCE_ROT_BOUNDED" as const : "GOVERNANCE_ROT_DETECTED" as const, rotScore, maxRotScore, evidenceIds: [...evidenceIds] };
}
