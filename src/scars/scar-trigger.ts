export function scarTrigger(pattern: string, observedPattern: string, recurrenceCount: number, threshold: number, evidenceIds: string[]) {
  if (pattern.length === 0 || observedPattern.length === 0 || recurrenceCount < 0 || threshold < 0 || evidenceIds.length === 0) throw new Error("scar_trigger_requires_evidence");
  const triggered = pattern === observedPattern && recurrenceCount >= threshold;
  return { status: triggered ? "SCAR_TRIGGERED" as const : "SCAR_NOT_TRIGGERED" as const, pattern, observedPattern, recurrenceCount, threshold, evidenceIds: [...evidenceIds] };
}
