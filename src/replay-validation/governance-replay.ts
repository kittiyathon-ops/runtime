export function governanceReplay(decisionDigestStable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("governance_replay_requires_evidence");
  return { status: decisionDigestStable ? "GOVERNANCE_REPLAY_VALID" as const : "GOVERNANCE_REPLAY_INVALID" as const, evidenceIds: [...evidenceIds] };
}
