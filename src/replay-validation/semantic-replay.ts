export function semanticReplay(meaningStable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("semantic_replay_requires_evidence");
  return { status: meaningStable ? "SEMANTIC_REPLAY_VALID" as const : "SEMANTIC_REPLAY_INVALID" as const, evidenceIds: [...evidenceIds] };
}
