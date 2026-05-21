export function burnInWindow(name: "24h" | "7d" | "30d" | "90d", observedHours: number, requiredHours: number, evidenceIds: string[]) {
  if (observedHours < 0 || requiredHours <= 0 || evidenceIds.length === 0) throw new Error("burn_in_window_requires_evidence");
  return { name, status: observedHours >= requiredHours ? "BURN_IN_WINDOW_COMPLETE" as const : "BURN_IN_WINDOW_INCOMPLETE" as const, observedHours, requiredHours, evidenceIds: [...evidenceIds] };
}
