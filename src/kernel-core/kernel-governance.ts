export function kernelGovernance(nonOverridableRules: readonly string[], observedRules: readonly string[], evidenceIds: string[]) {
  if (nonOverridableRules.length === 0 || observedRules.length === 0 || evidenceIds.length === 0) throw new Error("kernel_governance_requires_evidence");
  const observed = new Set(observedRules);
  const missing = [...nonOverridableRules].filter((rule) => !observed.has(rule)).sort();
  return {
    status: missing.length === 0 ? "GOVERNANCE_INVARIANTS_PRESERVED" as const : "GOVERNANCE_INVARIANTS_MISSING" as const,
    missing,
    doctrineMutationAllowed: false,
    evidenceIds: [...evidenceIds]
  };
}
