export function scarRecommendation(scarId: string, recommendedCheck: string, operatorApproval: boolean, governanceApproval: boolean, evidenceIds: string[]) {
  if (scarId.length === 0 || recommendedCheck.length === 0 || evidenceIds.length === 0) throw new Error("scar_recommendation_requires_evidence");
  return {
    scarId,
    status: operatorApproval && governanceApproval ? "SCAR_RECOMMENDATION_READY_FOR_REVIEW" as const : "SCAR_RECOMMENDATION_PENDING_APPROVAL" as const,
    recommendedCheck,
    doctrineMutated: false,
    operatorApproval,
    governanceApproval,
    evidenceIds: [...evidenceIds]
  };
}
