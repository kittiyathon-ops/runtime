export function agentSocieties(agentIds: readonly string[], evidenceIds: string[]) {
  if (agentIds.length === 0 || evidenceIds.length === 0) throw new Error("agent_societies_requires_evidence");
  return { agentCount: new Set(agentIds).size, evidenceIds: [...evidenceIds], replaySafe: true as const };
}
