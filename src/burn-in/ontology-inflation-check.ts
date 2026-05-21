export function ontologyInflationCheck(inflationEvents: number, observedDays: number, evidenceIds: string[]) {
  if (inflationEvents < 0 || observedDays < 0 || evidenceIds.length === 0) throw new Error("ontology_inflation_check_requires_evidence");
  return { status: inflationEvents === 0 && observedDays >= 30 ? "NO_ONTOLOGY_INFLATION_30D_PASSED" as const : "NO_ONTOLOGY_INFLATION_30D_FAILED" as const, inflationEvents, observedDays, evidenceIds: [...evidenceIds] };
}
