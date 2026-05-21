export function incidentStatus(activeIncidentIds: readonly string[], acknowledgedIncidentIds: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("incident_status_requires_evidence");
  const acknowledged = new Set(acknowledgedIncidentIds);
  const unacknowledged = [...activeIncidentIds].filter((id) => !acknowledged.has(id)).sort();
  return { status: unacknowledged.length > 0 ? "INCIDENT_ACK_REQUIRED" as const : "INCIDENTS_ACKNOWLEDGED" as const, activeIncidentIds: [...activeIncidentIds].sort(), unacknowledged, evidenceIds: [...evidenceIds] };
}
