export function interAgentGovernance(agentCount: number, legitimate: boolean, evidenceIds: string[]) {
  if (agentCount <= 0 || evidenceIds.length === 0) throw new Error("inter_agent_governance_requires_evidence");
  return { status: legitimate ? "LEGITIMATE" as const : "ILLEGITIMATE" as const, agentCount, evidenceIds: [...evidenceIds] };
}
