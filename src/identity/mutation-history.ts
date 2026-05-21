export interface IdentityMutationRecord {
  mutationSeq: number;
  timestamp: number;
  traceId: string;
  mutationType: "doctrine_transition" | "policy_activation" | "governance_transition" | "invariant_update";
  reason: string;
  provenanceIds: string[];
}

export class MutationHistory {
  private readonly records: IdentityMutationRecord[] = [];
  private nextSeq = 1;

  append(input: Omit<IdentityMutationRecord, "mutationSeq"> & { mutationSeq?: number }): IdentityMutationRecord {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    if (input.provenanceIds.length === 0) throw new Error("identity_mutation_requires_provenance");
    const record = Object.freeze({ ...input, provenanceIds: [...input.provenanceIds], mutationSeq: input.mutationSeq ?? this.nextSeq });
    if (record.mutationSeq !== this.nextSeq) throw new Error(`identity_mutation_seq_not_append_only:${record.mutationSeq}`);
    this.records.push(record);
    this.nextSeq += 1;
    return record;
  }

  all(): readonly IdentityMutationRecord[] {
    return this.records;
  }
}
