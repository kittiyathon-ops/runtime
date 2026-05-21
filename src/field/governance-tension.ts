export function governanceTension(conflicts: readonly { domainId: string; constitutionalPressure: number; policyConflict: number; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (conflicts.length === 0 || evidenceIds.length === 0) throw new Error("governance_tension_requires_evidence");
  const tensions = conflicts
    .map((conflict) => {
      if (conflict.domainId.length === 0 || conflict.constitutionalPressure < 0 || conflict.policyConflict < 0 || conflict.evidenceIds.length === 0) throw new Error("governance_tension_node_requires_evidence");
      const score = Math.min(1, (conflict.constitutionalPressure + conflict.policyConflict) / 2);
      return { domainId: conflict.domainId, score, status: score >= 0.7 ? "TENSION_HIGH" as const : "TENSION_BOUNDED" as const, evidenceIds: [...conflict.evidenceIds] };
    })
    .sort((a, b) => a.domainId.localeCompare(b.domainId));
  return { status: tensions.some((tension) => tension.status === "TENSION_HIGH") ? "GOVERNANCE_TENSION_ACCUMULATING" as const : "GOVERNANCE_TENSION_BOUNDED" as const, tensions, evidenceIds: [...evidenceIds] };
}
