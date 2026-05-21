export function deploymentSafeMode(required: boolean, freezeSupported: boolean, recoverySupported: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("deployment_safe_mode_requires_evidence");
  const safe = !required || (freezeSupported && recoverySupported);
  return {
    status: safe ? "SAFE_MODE_READY" as const : "SAFE_MODE_REJECTED" as const,
    required,
    freezeSupported,
    recoverySupported,
    evidenceIds: [...evidenceIds]
  };
}
