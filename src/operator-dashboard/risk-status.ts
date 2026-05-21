export function riskStatus(flags: readonly string[], exposure: number, maxExposure: number, evidenceIds: string[]) {
  if (exposure < 0 || maxExposure < 0 || evidenceIds.length === 0) throw new Error("risk_status_requires_evidence");
  const overLimit = exposure > maxExposure;
  return { status: flags.length > 0 || overLimit ? "RISK_ACTION_REQUIRED" as const : "RISK_CLEAR" as const, flags: [...flags].sort(), exposure, maxExposure, evidenceIds: [...evidenceIds] };
}
