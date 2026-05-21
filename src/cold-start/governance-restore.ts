export function governanceRestore(auditLineagePresent: boolean, policiesRestored: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("governance_restore_requires_evidence");
  return { status: auditLineagePresent && policiesRestored ? "GOVERNANCE_RESTORED" as const : "GOVERNANCE_RESTORE_FAILED" as const, evidenceIds: [...evidenceIds] };
}
