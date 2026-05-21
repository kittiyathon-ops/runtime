export function operationalRealityRehydrate(realityGraphPresent: boolean, trustedRealityReplayable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("operational_reality_rehydrate_requires_evidence");
  return { status: realityGraphPresent && trustedRealityReplayable ? "OPERATIONAL_REALITY_REHYDRATED" as const : "OPERATIONAL_REALITY_REHYDRATION_FAILED" as const, evidenceIds: [...evidenceIds] };
}
