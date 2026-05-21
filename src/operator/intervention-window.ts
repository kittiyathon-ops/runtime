export function interventionWindow(timeAvailableMs: number, requiredMs: number, evidenceIds: string[]) {
  if (timeAvailableMs < 0 || requiredMs < 0 || evidenceIds.length === 0) throw new Error("intervention_window_requires_evidence");
  return { status: timeAvailableMs >= requiredMs ? "INTERVENTION_POSSIBLE" as const : "INTERVENTION_WINDOW_MISSED" as const, timeAvailableMs, requiredMs, evidenceIds: [...evidenceIds] };
}
