export function selfPreservationDoctrine(continuityThreat: boolean, optimizationDemand: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("self_preservation_requires_evidence");
  return { action: continuityThreat ? "SACRIFICE_OPTIMIZATION" as const : optimizationDemand ? "ALLOW_BOUNDED_OPTIMIZATION" as const : "CONTINUE" as const, evidenceIds: [...evidenceIds] };
}
