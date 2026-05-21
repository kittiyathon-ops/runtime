export function operationalDiplomacy(conflicts: number, resolutions: number, evidenceIds: string[]) {
  if (conflicts < 0 || resolutions < 0 || evidenceIds.length === 0) throw new Error("operational_diplomacy_requires_evidence");
  return { status: resolutions >= conflicts ? "STABLE" as const : "TENSE" as const, conflicts, resolutions, evidenceIds: [...evidenceIds] };
}
