export function existentialDrift(expectedHash: string, actualHash: string, evidenceIds: string[]) {
  if (expectedHash.length === 0 || actualHash.length === 0 || evidenceIds.length === 0) throw new Error("existential_drift_requires_evidence");
  return { status: expectedHash === actualHash ? "STABLE" as const : "DRIFTING" as const, driftScore: expectedHash === actualHash ? 0 : 1, evidenceIds: [...evidenceIds] };
}
