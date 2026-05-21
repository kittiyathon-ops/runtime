export function cognitionReduction(semanticOverload: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("cognition_reduction_requires_evidence");
  return { status: semanticOverload ? "REDUCE_COGNITION" as const : "COGNITION_BOUNDED" as const, evidenceIds: [...evidenceIds] };
}
