export type ReplayCompatibilityRisk = "low" | "medium" | "high";
export type GovernanceSemanticFractureRisk = "low" | "medium" | "high";

export interface SemanticApprovalChain {
  readonly replaySafeValidation: boolean;
  readonly doctrineSafeValidation: boolean;
  readonly governanceApproval: boolean;
  readonly operatorApproval: boolean;
  readonly semanticAttestation: boolean;
  readonly replayCompatibilityVerification: boolean;
}

export function mergeCandidate(conceptA: string, conceptB: string, confidence: number, replayCompatibilityRisk: ReplayCompatibilityRisk, governanceSemanticFractureRisk: GovernanceSemanticFractureRisk, approvals: SemanticApprovalChain, evidenceIds: string[]) {
  if (conceptA.length === 0 || conceptB.length === 0 || confidence < 0 || confidence > 1 || evidenceIds.length === 0) throw new Error("merge_candidate_requires_evidence");
  const approvalComplete = approvals.replaySafeValidation && approvals.doctrineSafeValidation && approvals.governanceApproval && approvals.operatorApproval && approvals.semanticAttestation && approvals.replayCompatibilityVerification;
  const blockedByRisk = replayCompatibilityRisk === "high" || governanceSemanticFractureRisk === "high";
  return {
    status: approvalComplete && !blockedByRisk ? "MERGE_CANDIDATE_RECOMMENDED_ONLY" as const : "MERGE_CANDIDATE_BLOCKED" as const,
    conceptA,
    conceptB,
    confidence,
    replayCompatibilityRisk,
    governanceSemanticFractureRisk,
    approvalComplete,
    recommendationOnly: true,
    mutationPerformed: false,
    evidenceIds: [...evidenceIds]
  };
}
