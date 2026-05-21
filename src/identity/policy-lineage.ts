import { identityFingerprint } from "./identity-fingerprint.js";

export interface PolicyLineageEntry {
  policyId: string;
  version: string;
  activatedAt: number;
  traceId: string;
  evidenceIds: string[];
}

export class PolicyLineage {
  private readonly entries: PolicyLineageEntry[] = [];

  append(input: PolicyLineageEntry): PolicyLineageEntry {
    if (input.policyId.length === 0 || input.version.length === 0 || input.traceId.length === 0) throw new Error("policy_lineage_identity_required");
    if (input.evidenceIds.length === 0) throw new Error("policy_lineage_requires_evidence");
    const previous = this.entries.at(-1);
    if (previous !== undefined && input.activatedAt < previous.activatedAt) throw new Error("policy_lineage_time_regression");
    const entry = Object.freeze({ ...input, evidenceIds: [...input.evidenceIds] });
    this.entries.push(entry);
    return entry;
  }

  fingerprint(): string {
    return identityFingerprint(this.entries.map((entry) => ({
      policyId: entry.policyId,
      version: entry.version,
      activatedAt: entry.activatedAt,
      traceId: entry.traceId,
      evidenceIds: [...entry.evidenceIds]
    })));
  }

  all(): readonly PolicyLineageEntry[] {
    return this.entries;
  }
}
