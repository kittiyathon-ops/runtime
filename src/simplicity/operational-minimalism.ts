export function operationalMinimalism(currentCount: number, essentialCount: number, evidenceIds: string[]) {
  if (currentCount < 0 || essentialCount < 0 || essentialCount > currentCount || evidenceIds.length === 0) throw new Error("operational_minimalism_requires_evidence");
  const removableCount = currentCount - essentialCount;
  return {
    status: removableCount > 0 ? "SIMPLIFICATION_AVAILABLE" as const : "MINIMAL" as const,
    currentCount,
    essentialCount,
    removableCount,
    evidenceIds: [...evidenceIds]
  };
}
