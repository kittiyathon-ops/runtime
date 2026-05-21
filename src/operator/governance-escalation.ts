export function governanceEscalation(severity: number, threshold: number, evidenceIds: string[]) {
  if (severity < 0 || threshold < 0 || evidenceIds.length === 0) throw new Error("operator_governance_escalation_requires_evidence");
  return { status: severity >= threshold ? "ESCALATE_TO_OPERATOR" as const : "NO_ESCALATION" as const, severity, threshold, evidenceIds: [...evidenceIds] };
}
