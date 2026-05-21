export const KERNEL_INVARIANTS = Object.freeze([
  "identity_continuity",
  "replay_integrity",
  "governance_invariants",
  "operational_truth",
  "recovery_ordering",
  "degradation_doctrine"
] as const);

export type KernelInvariant = typeof KERNEL_INVARIANTS[number];

export interface KernelInvariantCheck {
  readonly invariant: KernelInvariant;
  readonly preserved: boolean;
  readonly evidenceIds: readonly string[];
}

export function kernelInvariants(checks: readonly KernelInvariantCheck[], evidenceIds: string[]) {
  if (checks.length === 0 || evidenceIds.length === 0) throw new Error("kernel_invariants_require_evidence");
  const present = new Map<KernelInvariant, boolean>();
  for (const check of checks) {
    if (check.evidenceIds.length === 0) throw new Error("kernel_invariant_check_requires_evidence");
    present.set(check.invariant, check.preserved);
  }
  const missing = KERNEL_INVARIANTS.filter((invariant) => present.get(invariant) !== true);
  return {
    status: missing.length === 0 ? "KERNEL_INVARIANTS_PRESERVED" as const : "KERNEL_INVARIANTS_WEAKENED" as const,
    missing,
    weakeningAllowed: false,
    evidenceIds: [...evidenceIds]
  };
}
