export const KERNEL_INVARIANTS = Object.freeze([
  "identity_continuity",
  "append_only_memory",
  "constitutional_governance",
  "causal_truth",
  "deterministic_recovery"
] as const);

export type KernelInvariant = typeof KERNEL_INVARIANTS[number];

export function minimumViableInvariants(present: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("kernel_invariants_require_evidence");
  const presentSet = new Set(present);
  const missing = KERNEL_INVARIANTS.filter((invariant) => !presentSet.has(invariant));
  return { status: missing.length === 0 ? "VIABLE" as const : "NON_VIABLE" as const, missing, evidenceIds: [...evidenceIds] };
}
