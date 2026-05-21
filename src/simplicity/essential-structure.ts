export function essentialStructure(structures: readonly string[], requiredStructures: readonly string[], evidenceIds: string[]) {
  if (requiredStructures.length === 0 || evidenceIds.length === 0) throw new Error("essential_structure_requires_evidence");
  const structureSet = new Set(structures);
  const missing = [...requiredStructures].sort().filter((structure) => !structureSet.has(structure));
  const surplus = [...structures].sort().filter((structure) => !requiredStructures.includes(structure));
  return {
    status: missing.length === 0 ? "ESSENTIAL_STRUCTURE_PRESENT" as const : "ESSENTIAL_STRUCTURE_MISSING" as const,
    missing,
    surplus,
    evidenceIds: [...evidenceIds]
  };
}
