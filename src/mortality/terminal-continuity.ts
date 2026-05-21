export function terminalContinuity(continuityArtifacts: readonly string[], requiredArtifacts: readonly string[], evidenceIds: string[]) {
  if (requiredArtifacts.length === 0 || evidenceIds.length === 0) throw new Error("terminal_continuity_requires_evidence");
  const present = new Set(continuityArtifacts);
  const missing = [...requiredArtifacts].sort().filter((artifact) => !present.has(artifact));
  return {
    status: missing.length === 0 ? "CONTINUITY_PRESERVED" as const : "CONTINUITY_BROKEN" as const,
    missing,
    evidenceIds: [...evidenceIds]
  };
}
