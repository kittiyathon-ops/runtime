export function duplicateFills(duplicates: number, maxDuplicates: number, evidenceIds: string[]) {
  if (duplicates < 0 || maxDuplicates < 0 || evidenceIds.length === 0) throw new Error("duplicate_fills_requires_evidence");
  return { scenarioId: "duplicate_fills", status: duplicates <= maxDuplicates ? "BURN_IN_CONTAINED" as const : "BURN_IN_DEGRADED" as const, duplicates, maxDuplicates, evidenceIds: [...evidenceIds] };
}
