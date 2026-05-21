export type EscalationPriority = "info" | "warning" | "critical" | "emergency";

export function escalationDiscipline(priority: EscalationPriority, acknowledged: boolean, manualReviewComplete: boolean, emergencyStopConfirmed: boolean, postIncidentReviewRequired: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("escalation_discipline_requires_evidence");
  const requiresAck = priority === "critical" || priority === "emergency";
  const blocked = (requiresAck && !acknowledged) || !manualReviewComplete || (priority === "emergency" && !emergencyStopConfirmed);
  return { status: blocked ? "OPERATOR_ESCALATION_BLOCKED" as const : "OPERATOR_ESCALATION_DISCIPLINED" as const, priority, acknowledged, manualReviewComplete, emergencyStopConfirmed, postIncidentReviewRequired, evidenceIds: [...evidenceIds] };
}
