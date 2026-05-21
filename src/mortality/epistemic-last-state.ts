export interface EpistemicLastStateInput {
  lastTrustedRealityId: string;
  disputedRealityIds: readonly string[];
  finalConfidence: number;
  finalGovernanceDecisionId: string;
  finalConstitutionalStatus: "LEGITIMATE" | "FAILED";
  finalCausalChain: readonly string[];
  evidenceIds: string[];
}

export function epistemicLastState(input: EpistemicLastStateInput) {
  if (
    input.lastTrustedRealityId.length === 0 ||
    input.finalGovernanceDecisionId.length === 0 ||
    input.finalCausalChain.length === 0 ||
    input.evidenceIds.length === 0 ||
    input.finalConfidence < 0 ||
    input.finalConfidence > 1
  ) {
    throw new Error("epistemic_last_state_requires_evidence");
  }
  return {
    status: "TERMINAL_TRUTH_RECORDED" as const,
    lastTrustedRealityId: input.lastTrustedRealityId,
    disputedRealityIds: [...input.disputedRealityIds].sort(),
    finalConfidence: input.finalConfidence,
    finalGovernanceDecisionId: input.finalGovernanceDecisionId,
    finalConstitutionalStatus: input.finalConstitutionalStatus,
    finalCausalChain: [...input.finalCausalChain],
    replayable: true as const,
    evidenceIds: [...input.evidenceIds]
  };
}
