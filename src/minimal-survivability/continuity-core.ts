export function continuityCore(identity: boolean, timeline: boolean, governance: boolean, truthLineage: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("continuity_core_requires_evidence");
  const preserved = identity && timeline && governance && truthLineage;
  return {
    status: preserved ? "CONTINUITY_CORE_PRESERVED" as const : "CONTINUITY_CORE_BROKEN" as const,
    identity,
    timeline,
    governance,
    truthLineage,
    evidenceIds: [...evidenceIds]
  };
}
