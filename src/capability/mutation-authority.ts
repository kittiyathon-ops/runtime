export interface MutationAuthority {
  authorityId: string;
  capabilityId: string;
  traceId: string;
  reconciled: boolean;
  provenanceIds: string[];
}

export class MutationAuthorityValidator {
  assert(authority: MutationAuthority): void {
    if (authority.traceId.length === 0) throw new Error("trace_id_required");
    if (!authority.reconciled) throw new Error("mutation_requires_reconciliation");
    if (authority.provenanceIds.length === 0) throw new Error("mutation_requires_provenance");
  }
}
