import type { RuntimeIdentity } from "./runtime-identity.js";

export interface IdentityDriftReport {
  status: "STABLE" | "DRIFT_DETECTED";
  driftScore: number;
  reasons: string[];
  traceId: string;
  evidenceIds: string[];
}

export class IdentityDriftDetector {
  detect(expected: RuntimeIdentity, actual: RuntimeIdentity, traceId: string, evidenceIds: string[]): IdentityDriftReport {
    if (traceId.length === 0) throw new Error("trace_id_required");
    const reasons: string[] = [];
    if (expected.genesisHash !== actual.genesisHash) reasons.push("genesis_hash_changed");
    if (expected.governanceLineageHash !== actual.governanceLineageHash) reasons.push("governance_lineage_changed");
    if (expected.policyLineageHash !== actual.policyLineageHash) reasons.push("policy_lineage_changed");
    if (expected.invariantFingerprint !== actual.invariantFingerprint) reasons.push("invariant_fingerprint_changed");
    if (expected.doctrineVersionId !== actual.doctrineVersionId) reasons.push("doctrine_version_changed");
    if (expected.continuityHash !== actual.continuityHash) reasons.push("continuity_hash_changed");
    if (reasons.length > 0 && evidenceIds.length === 0) throw new Error("identity_drift_requires_evidence");
    return {
      status: reasons.length === 0 ? "STABLE" : "DRIFT_DETECTED",
      driftScore: reasons.length === 0 ? 0 : reasons.length / 6,
      reasons,
      traceId,
      evidenceIds
    };
  }
}
