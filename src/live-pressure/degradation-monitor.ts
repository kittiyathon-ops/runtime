export function degradationMonitor(degradationEvents: number, recoveryEvents: number, maxUnrecovered: number, evidenceIds: string[]) {
  if (degradationEvents < 0 || recoveryEvents < 0 || maxUnrecovered < 0 || evidenceIds.length === 0) throw new Error("degradation_monitor_requires_evidence");
  const unrecovered = Math.max(0, degradationEvents - recoveryEvents);
  return { status: unrecovered <= maxUnrecovered ? "DEGRADATION_STABLE" as const : "DEGRADATION_UNSTABLE" as const, unrecovered, evidenceIds: [...evidenceIds] };
}
