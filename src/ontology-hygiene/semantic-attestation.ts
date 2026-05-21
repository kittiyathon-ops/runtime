import type { SemanticApprovalChain } from "./merge-candidate.js";

export interface SemanticAuditRecord {
  readonly seq: number;
  readonly action: "RECOMMEND" | "BLOCK" | "ATTEST";
  readonly subject: string;
  readonly evidenceIds: readonly string[];
}

export function semanticAttestation(traceId: string, approvals: SemanticApprovalChain, replayIntegrityPreserved: boolean, identityContinuityPreserved: boolean, explainabilityPreserved: boolean, auditRecords: readonly SemanticAuditRecord[], evidenceIds: string[]) {
  if (traceId.length === 0 || auditRecords.length === 0 || evidenceIds.length === 0) throw new Error("semantic_attestation_requires_evidence");
  for (const record of auditRecords) {
    if (record.seq <= 0 || record.subject.length === 0 || record.evidenceIds.length === 0) throw new Error("semantic_audit_record_requires_evidence");
  }
  const approvalComplete = approvals.replaySafeValidation && approvals.doctrineSafeValidation && approvals.governanceApproval && approvals.operatorApproval && approvals.semanticAttestation && approvals.replayCompatibilityVerification;
  const stable = approvalComplete && replayIntegrityPreserved && identityContinuityPreserved && explainabilityPreserved;
  return {
    traceId,
    status: stable ? "SEMANTIC_ATTESTATION_REVIEW_READY" as const : "SEMANTIC_ATTESTATION_REJECTED" as const,
    approvalComplete,
    replayIntegrityPreserved,
    identityContinuityPreserved,
    explainabilityPreserved,
    auditRecords: auditRecords.map((record) => ({ ...record, evidenceIds: [...record.evidenceIds] })),
    recommendationOnly: true,
    mutationPerformed: false,
    evidenceIds: [...evidenceIds]
  };
}
