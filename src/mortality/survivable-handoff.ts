export interface SurvivableHandoffInput {
  sourceRuntimeId: string;
  targetRuntimeId: string;
  governanceLineageTransferred: boolean;
  constitutionalLineageTransferred: boolean;
  memoryContinuityTransferred: boolean;
  identityAttestationTransferred: boolean;
  replayContinuityTransferred: boolean;
  evidenceIds: string[];
}

export function survivableHandoff(input: SurvivableHandoffInput) {
  if (input.sourceRuntimeId.length === 0 || input.targetRuntimeId.length === 0 || input.evidenceIds.length === 0) {
    throw new Error("survivable_handoff_requires_evidence");
  }
  const complete = input.governanceLineageTransferred &&
    input.constitutionalLineageTransferred &&
    input.memoryContinuityTransferred &&
    input.identityAttestationTransferred &&
    input.replayContinuityTransferred;
  return {
    status: complete ? "HANDOFF_READY" as const : "HANDOFF_BLOCKED" as const,
    sourceRuntimeId: input.sourceRuntimeId,
    targetRuntimeId: input.targetRuntimeId,
    attestedGovernanceContinuity: input.governanceLineageTransferred && input.constitutionalLineageTransferred,
    replaySafe: input.replayContinuityTransferred,
    evidenceIds: [...input.evidenceIds]
  };
}
