export function dashboardAttestation(traceId: string, summaryStatus: string, criticalPathCompressed: boolean, operatorVisible: boolean, evidenceIds: string[]) {
  if (traceId.length === 0 || evidenceIds.length === 0) throw new Error("dashboard_attestation_requires_evidence");
  return { traceId, status: criticalPathCompressed && operatorVisible ? "DASHBOARD_ATTESTED" as const : "DASHBOARD_ATTESTATION_REJECTED" as const, summaryStatus, evidenceIds: [...evidenceIds] };
}
