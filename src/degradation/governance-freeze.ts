export function governanceFreeze(overloaded: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("governance_freeze_requires_evidence");
  return { status: overloaded ? "FREEZE_GOVERNANCE_MUTATION" as const : "GOVERNANCE_ACTIVE" as const, evidenceIds: [...evidenceIds] };
}
