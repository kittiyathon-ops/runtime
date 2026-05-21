import type { DeploymentMode } from "./deployment-profile.js";

export function capitalEnvelope(mode: DeploymentMode, requestedCapital: number, maxCapital: number, evidenceIds: string[]) {
  if (requestedCapital < 0 || maxCapital < 0 || evidenceIds.length === 0) throw new Error("capital_envelope_requires_evidence");
  const capitalAllowed = mode === "LIMITED_CAPITAL" || mode === "RESTRICTED" || mode === "LIVE";
  const withinEnvelope = capitalAllowed && requestedCapital <= maxCapital;
  return {
    status: withinEnvelope ? "CAPITAL_ENVELOPE_ACCEPTED" as const : "CAPITAL_ENVELOPE_REJECTED" as const,
    mode,
    requestedCapital,
    maxCapital,
    evidenceIds: [...evidenceIds]
  };
}
