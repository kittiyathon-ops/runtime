export type CollapsePhase = "FREEZE_INPUTS" | "PRESERVE_LINEAGE" | "FINALIZE_TRUTH" | "TERMINATE_AUTHORITY";

export const GRACEFUL_COLLAPSE_ORDER: readonly CollapsePhase[] = Object.freeze([
  "FREEZE_INPUTS",
  "PRESERVE_LINEAGE",
  "FINALIZE_TRUTH",
  "TERMINATE_AUTHORITY"
]);

export function gracefulCollapse(availablePhases: readonly CollapsePhase[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("graceful_collapse_requires_evidence");
  const available = new Set(availablePhases);
  const missing = GRACEFUL_COLLAPSE_ORDER.filter((phase) => !available.has(phase));
  return {
    status: missing.length === 0 ? "COLLAPSE_READY" as const : "COLLAPSE_UNSAFE" as const,
    order: [...GRACEFUL_COLLAPSE_ORDER],
    missing,
    replaySafe: missing.length === 0,
    preserveConstitutionalInvariants: true as const,
    evidenceIds: [...evidenceIds]
  };
}
