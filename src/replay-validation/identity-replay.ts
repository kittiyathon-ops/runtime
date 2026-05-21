export function identityReplay(identityDigestStable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("identity_replay_requires_evidence");
  return { status: identityDigestStable ? "IDENTITY_REPLAY_VALID" as const : "IDENTITY_REPLAY_INVALID" as const, evidenceIds: [...evidenceIds] };
}
