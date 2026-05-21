export function stabilizationOrchestrator(risks: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("stabilization_orchestrator_requires_evidence");
  return { action: risks.length > 0 ? "CONTAIN_RECURSION" as const : "CONTINUE" as const, risks: [...risks].sort(), evidenceIds: [...evidenceIds], preserveConstitutionalContinuity: true as const };
}
