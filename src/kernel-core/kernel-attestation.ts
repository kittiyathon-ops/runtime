export interface KernelAuditDecision {
  readonly decisionId: string;
  readonly decision: string;
  readonly evidenceIds: readonly string[];
}

export function kernelAttestation(traceId: string, invariantStatus: string, decisions: readonly KernelAuditDecision[], evidenceIds: string[]) {
  if (traceId.length === 0 || decisions.length === 0 || evidenceIds.length === 0) throw new Error("kernel_attestation_requires_evidence");
  for (const decision of decisions) {
    if (decision.decisionId.length === 0 || decision.decision.length === 0 || decision.evidenceIds.length === 0) throw new Error("kernel_decision_requires_evidence");
  }
  return {
    traceId,
    status: invariantStatus === "KERNEL_INVARIANTS_PRESERVED" ? "KERNEL_ATTESTED" as const : "KERNEL_ATTESTATION_REJECTED" as const,
    auditBacked: true,
    decisionCount: decisions.length,
    evidenceIds: [...evidenceIds]
  };
}
