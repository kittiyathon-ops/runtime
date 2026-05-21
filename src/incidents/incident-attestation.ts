export function incidentAttestation(incidentId: string, traceId: string, completeRecord: boolean, replaySnapshotAttached: boolean, evidenceIds: string[]) {
  if (incidentId.length === 0 || traceId.length === 0 || evidenceIds.length === 0) throw new Error("incident_attestation_requires_evidence");
  return { incidentId, traceId, status: completeRecord && replaySnapshotAttached ? "INCIDENT_ATTESTED" as const : "INCIDENT_ATTESTATION_REJECTED" as const, completeRecord, replaySnapshotAttached, evidenceIds: [...evidenceIds] };
}
