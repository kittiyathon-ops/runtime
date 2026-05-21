export function eventAmplification(inputEvents: number, emittedEvents: number, maxAmplification: number, evidenceIds: string[]) {
  if (inputEvents <= 0 || emittedEvents < 0 || maxAmplification < 1 || evidenceIds.length === 0) throw new Error("event_amplification_requires_evidence");
  const amplification = emittedEvents / inputEvents;
  return {
    status: amplification <= maxAmplification ? "EVENT_AMPLIFICATION_BOUNDED" as const : "EVENT_STORM_DETECTED" as const,
    inputEvents,
    emittedEvents,
    amplification,
    maxAmplification,
    evidenceIds: [...evidenceIds]
  };
}
