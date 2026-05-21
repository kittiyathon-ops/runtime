export function orphanFill(fillOrderIds: readonly string[], knownOrderIds: readonly string[], evidenceIds: string[]) {
  if (fillOrderIds.length === 0 || evidenceIds.length === 0) throw new Error("orphan_fill_requires_evidence");
  const known = new Set(knownOrderIds);
  const orphanFills = [...fillOrderIds].filter((orderId) => !known.has(orderId)).sort();
  return { status: orphanFills.length > 0 ? "ORPHAN_FILL_DETECTED" as const : "ORPHAN_FILL_CLEAR" as const, orphanFills, action: orphanFills.length > 0 ? "RECONSTRUCT_ORDER_LINEAGE" as const : "MONITOR" as const, evidenceIds: [...evidenceIds] };
}
