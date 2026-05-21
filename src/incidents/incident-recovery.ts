export function incidentRecovery(action: string, recovered: boolean, replayVerified: boolean, evidenceIds: string[]) {
  if (action.length === 0 || evidenceIds.length === 0) throw new Error("incident_recovery_requires_evidence");
  return { status: recovered && replayVerified ? "INCIDENT_RECOVERED" as const : "INCIDENT_RECOVERY_PENDING" as const, action, recovered, replayVerified, evidenceIds: [...evidenceIds] };
}
