import type { RuntimeIdentity } from "./runtime-identity.js";

export interface IdentityCoherenceReport {
  status: "COHERENT" | "INCOHERENT";
  reasons: string[];
}

export class IdentityCoherenceCheck {
  check(identity: RuntimeIdentity): IdentityCoherenceReport {
    const reasons: string[] = [];
    if (identity.runtimeId.length === 0) reasons.push("runtime_id_missing");
    if (identity.operationalIdentityScore < 0 || identity.operationalIdentityScore > 1) reasons.push("identity_score_invalid");
    if (identity.identityDriftScore < 0 || identity.identityDriftScore > 1) reasons.push("drift_score_invalid");
    if (identity.operationalIdentityScore + identity.identityDriftScore !== 1) reasons.push("identity_score_incoherent");
    return { status: reasons.length === 0 ? "COHERENT" : "INCOHERENT", reasons };
  }
}
