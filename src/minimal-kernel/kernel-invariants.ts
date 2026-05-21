export const MINIMAL_KERNEL_INVARIANTS = Object.freeze(["identity_continuity", "invariant_enforcement", "causal_timeline", "safe_degradation", "operational_truth", "recovery_orchestration"] as const);

export function minimalKernelInvariants(present: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("minimal_kernel_invariants_require_evidence");
  const presentSet = new Set(present);
  const missing = MINIMAL_KERNEL_INVARIANTS.filter((invariant) => !presentSet.has(invariant));
  return { status: missing.length === 0 ? "KERNEL_COMPLETE" as const : "KERNEL_INCOMPLETE" as const, missing, evidenceIds: [...evidenceIds] };
}
