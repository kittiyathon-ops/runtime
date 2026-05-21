export function kernelGovernance(constitutionallyLegitimate: boolean, minimumAuthority: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("kernel_governance_requires_evidence");
  return { status: constitutionallyLegitimate && minimumAuthority ? "LEGITIMATE" as const : "FAILED" as const, evidenceIds: [...evidenceIds] };
}
