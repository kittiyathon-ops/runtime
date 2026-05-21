export interface AdversarialScenarioResult {
  scenarioId: string;
  status: "CONTAINED" | "ESCALATED";
  severity: number;
  evidenceIds: string[];
}

export function adversarialOrchestrator(results: readonly AdversarialScenarioResult[], chaosBudget: number, evidenceIds: string[]) {
  if (results.length === 0 || chaosBudget < 0 || evidenceIds.length === 0) throw new Error("adversarial_orchestrator_requires_evidence");
  const totalSeverity = results.reduce((sum, result) => {
    if (result.scenarioId.length === 0 || result.severity < 0 || result.evidenceIds.length === 0) throw new Error("adversarial_result_requires_evidence");
    return sum + result.severity;
  }, 0);
  return {
    status: totalSeverity <= chaosBudget && results.every((result) => result.status === "CONTAINED") ? "SURVIVED" as const : "DEGRADE" as const,
    totalSeverity,
    chaosBudget,
    scenarioIds: results.map((result) => result.scenarioId).sort(),
    evidenceIds: [...evidenceIds]
  };
}
