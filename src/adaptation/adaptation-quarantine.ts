export function adaptationQuarantine(unsafe: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("adaptation_quarantine_requires_evidence");
  return { status: unsafe ? "QUARANTINED" as const : "CLEAR" as const, evidenceIds: [...evidenceIds] };
}
