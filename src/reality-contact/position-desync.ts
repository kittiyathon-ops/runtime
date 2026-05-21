export function positionDesync(localPosition: number, exchangePosition: number, tolerance: number, evidenceIds: string[]) {
  if (tolerance < 0 || evidenceIds.length === 0) throw new Error("position_desync_requires_evidence");
  const delta = Math.abs(localPosition - exchangePosition);
  return { status: delta > tolerance ? "POSITION_DESYNC_DETECTED" as const : "POSITION_SYNCED" as const, localPosition, exchangePosition, delta, tolerance, action: delta > tolerance ? "BLOCK_EXECUTION_AND_RECONCILE" as const : "MONITOR" as const, evidenceIds: [...evidenceIds] };
}
