export function selfConsistencyDecay(current: number, previous: number, maxDecay: number, evidenceIds: string[]) {
  if (current < 0 || previous < 0 || maxDecay < 0 || evidenceIds.length === 0) throw new Error("self_consistency_decay_requires_evidence");
  const decay = previous - current;
  return { status: decay > maxDecay ? "SELF_CONSISTENCY_DECAYED" as const : "SELF_CONSISTENCY_STABLE" as const, decay, evidenceIds: [...evidenceIds] };
}
