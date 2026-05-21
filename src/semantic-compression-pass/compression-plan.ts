export function compressionPlan(mergeIds: readonly string[], retainedPrimitives: readonly string[], testPlanIds: readonly string[], evidenceIds: string[]) {
  if (retainedPrimitives.length === 0 || testPlanIds.length === 0 || evidenceIds.length === 0) throw new Error("compression_plan_requires_evidence");
  return {
    status: mergeIds.length > 0 ? "COMPRESSION_RECOMMENDED" as const : "NO_COMPRESSION_REQUIRED" as const,
    mergeIds: [...mergeIds].sort(),
    retainedPrimitives: [...retainedPrimitives].sort(),
    testPlanIds: [...testPlanIds].sort(),
    destructive: false as const,
    evidenceIds: [...evidenceIds]
  };
}
