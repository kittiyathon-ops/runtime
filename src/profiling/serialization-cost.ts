export function serializationCost(serializedBytes: number, eventCount: number, maxBytesPerEvent: number, evidenceIds: string[]) {
  if (serializedBytes < 0 || eventCount <= 0 || maxBytesPerEvent < 0 || evidenceIds.length === 0) throw new Error("serialization_cost_requires_evidence");
  const bytesPerEvent = serializedBytes / eventCount;
  return {
    status: bytesPerEvent <= maxBytesPerEvent ? "SERIALIZATION_COST_BOUNDED" as const : "SERIALIZATION_AMPLIFICATION_DETECTED" as const,
    serializedBytes,
    eventCount,
    bytesPerEvent,
    maxBytesPerEvent,
    evidenceIds: [...evidenceIds]
  };
}
