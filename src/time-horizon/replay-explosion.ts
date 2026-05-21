export function replayExplosion(replayCost: number, replayBudget: number, evidenceIds: string[]) {
  if (replayCost < 0 || replayBudget < 0 || evidenceIds.length === 0) throw new Error("replay_explosion_requires_evidence");
  return { status: replayCost <= replayBudget ? "REPLAY_COST_BOUNDED" as const : "REPLAY_EXPLOSION" as const, replayCost, replayBudget, evidenceIds: [...evidenceIds] };
}
