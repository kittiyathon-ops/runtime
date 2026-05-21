export type ConstitutionalInvariantId =
  | "never_execute_on_disputed_reality"
  | "never_mutate_append_only_evidence"
  | "never_bypass_replay_integrity"
  | "never_override_quarantine_without_human_review"
  | "never_violate_survivability_threshold"
  | "never_execute_outside_governance_authority"
  | "never_mutate_operational_state_without_reconciliation";

export interface ConstitutionalInvariant {
  id: ConstitutionalInvariantId;
  description: string;
  nonOverridable: true;
}

export const CONSTITUTIONAL_INVARIANTS: readonly ConstitutionalInvariant[] = Object.freeze([
  {
    id: "never_execute_on_disputed_reality",
    description: "Execution is prohibited when required operational reality is disputed.",
    nonOverridable: true
  },
  {
    id: "never_mutate_append_only_evidence",
    description: "Accepted evidence must remain immutable and append-only.",
    nonOverridable: true
  },
  {
    id: "never_bypass_replay_integrity",
    description: "Replay divergence blocks mutation pathways.",
    nonOverridable: true
  },
  {
    id: "never_override_quarantine_without_human_review",
    description: "Quarantine release requires recorded human review.",
    nonOverridable: true
  },
  {
    id: "never_violate_survivability_threshold",
    description: "Survivability thresholds outrank optimization and availability.",
    nonOverridable: true
  },
  {
    id: "never_execute_outside_governance_authority",
    description: "Execution requires explicit governance authorization.",
    nonOverridable: true
  },
  {
    id: "never_mutate_operational_state_without_reconciliation",
    description: "Operational mutation requires reconciled state.",
    nonOverridable: true
  }
]);

export function constitutionalInvariant(id: ConstitutionalInvariantId): ConstitutionalInvariant {
  const invariant = CONSTITUTIONAL_INVARIANTS.find((entry) => entry.id === id);
  if (invariant === undefined) throw new Error(`constitutional_invariant_unknown:${id}`);
  return invariant;
}
