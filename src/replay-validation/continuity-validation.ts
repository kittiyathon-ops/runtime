export function continuityValidation(identityStable: boolean, governanceStable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("replay_continuity_validation_requires_evidence");
  return { status: identityStable && governanceStable ? "CONTINUITY_VALID" as const : "CONTINUITY_INVALID" as const, evidenceIds: [...evidenceIds] };
}
