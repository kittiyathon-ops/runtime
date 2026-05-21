export const IRREDUCIBLE_KERNEL_PRIMITIVES = [
  "identity_continuity",
  "timeline_continuity",
  "governance_continuity",
  "truth_lineage",
  "replay_recoverability",
  "kill_switch",
  "operational_attestation"
] as const;

export function irreducibleKernel(primitives: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("irreducible_kernel_requires_evidence");
  const primitiveSet = new Set(primitives);
  const missing = IRREDUCIBLE_KERNEL_PRIMITIVES.filter((primitive) => !primitiveSet.has(primitive));
  return {
    status: missing.length === 0 ? "IRREDUCIBLE_KERNEL_COMPLETE" as const : "IRREDUCIBLE_KERNEL_INCOMPLETE" as const,
    missing,
    disposableByDefault: true,
    evidenceIds: [...evidenceIds]
  };
}
