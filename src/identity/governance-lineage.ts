import { identityFingerprint } from "./identity-fingerprint.js";

export interface GovernanceLineageEntry {
  governanceId: string;
  state: string;
  decidedAt: number;
  traceId: string;
  evidenceIds: string[];
}

export class GovernanceLineage {
  private readonly entries: GovernanceLineageEntry[] = [];

  append(input: GovernanceLineageEntry): GovernanceLineageEntry {
    if (input.governanceId.length === 0 || input.traceId.length === 0) throw new Error("governance_lineage_identity_required");
    if (input.evidenceIds.length === 0) throw new Error("governance_lineage_requires_evidence");
    const previous = this.entries.at(-1);
    if (previous !== undefined && input.decidedAt < previous.decidedAt) throw new Error("governance_lineage_time_regression");
    const entry = Object.freeze({ ...input, evidenceIds: [...input.evidenceIds] });
    this.entries.push(entry);
    return entry;
  }

  fingerprint(): string {
    return identityFingerprint(this.entries.map((entry) => ({
      governanceId: entry.governanceId,
      state: entry.state,
      decidedAt: entry.decidedAt,
      traceId: entry.traceId,
      evidenceIds: [...entry.evidenceIds]
    })));
  }

  all(): readonly GovernanceLineageEntry[] {
    return this.entries;
  }
}
