export function quarantineCandidate(subsystemId: string, justified: boolean, humanReviewQueued: boolean, evidenceIds: string[]) {
  if (subsystemId.length === 0 || evidenceIds.length === 0) throw new Error("quarantine_candidate_requires_evidence");
  return {
    subsystemId,
    status: !justified && humanReviewQueued ? "QUARANTINE_CANDIDATE_REVIEW_REQUIRED" as const : "QUARANTINE_NOT_RECOMMENDED" as const,
    automaticRemovalAllowed: false,
    humanReviewRequired: !justified,
    evidenceIds: [...evidenceIds]
  };
}
