export function existenceJustification(subsystemId: string, scoreStatus: string, kernelContribution: readonly string[], evidenceIds: string[]) {
  if (subsystemId.length === 0 || kernelContribution.length === 0 || evidenceIds.length === 0) throw new Error("existence_justification_requires_evidence");
  const justified = scoreStatus === "SUBSYSTEM_JUSTIFIED";
  return { subsystemId, status: justified ? "EXISTENCE_JUSTIFIED" as const : "EXISTENCE_NOT_JUSTIFIED" as const, kernelContribution: [...kernelContribution].sort(), evidenceIds: [...evidenceIds] };
}
