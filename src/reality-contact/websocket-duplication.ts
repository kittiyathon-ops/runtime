export function websocketDuplication(eventIds: readonly string[], evidenceIds: string[]) {
  if (eventIds.length === 0 || evidenceIds.length === 0) throw new Error("websocket_duplication_requires_evidence");
  const unique = new Set(eventIds);
  return { status: unique.size < eventIds.length ? "WEBSOCKET_DUPLICATION_DETECTED" as const : "WEBSOCKET_DUPLICATION_CLEAR" as const, duplicateCount: eventIds.length - unique.size, evidenceIds: [...evidenceIds] };
}
