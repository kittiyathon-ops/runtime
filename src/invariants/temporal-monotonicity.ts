export function temporalMonotonicity(previousSeq: number, nextSeq: number, evidenceIds: string[]) {
  if (previousSeq < 0 || nextSeq < 0 || evidenceIds.length === 0) throw new Error("temporal_monotonicity_requires_evidence");
  return { invariant: "temporal_monotonicity" as const, status: nextSeq >= previousSeq ? "PRESERVED" as const : "VIOLATED" as const, evidenceIds: [...evidenceIds] };
}
