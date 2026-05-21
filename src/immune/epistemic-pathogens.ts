export function epistemicPathogens(pathogens: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("epistemic_pathogens_requires_evidence");
  return { status: pathogens.length > 0 ? "PATHOGENS_DETECTED" as const : "CLEAR" as const, pathogens: [...pathogens].sort(), evidenceIds: [...evidenceIds] };
}
