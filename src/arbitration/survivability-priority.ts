export function survivabilityPriority(safeModeNeeded: boolean, executionUrgent: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("survivability_priority_requires_evidence");
  return { priority: safeModeNeeded ? 1 : executionUrgent ? 0.7 : 0.4, evidenceIds: [...evidenceIds] };
}
