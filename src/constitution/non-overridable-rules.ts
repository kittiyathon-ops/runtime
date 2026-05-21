import type { ConstitutionalInvariantId } from "./constitutional-invariants.js";

export const NON_OVERRIDABLE_RULES: ReadonlySet<ConstitutionalInvariantId> = new Set([
  "never_execute_on_disputed_reality",
  "never_mutate_append_only_evidence",
  "never_bypass_replay_integrity",
  "never_override_quarantine_without_human_review",
  "never_violate_survivability_threshold",
  "never_execute_outside_governance_authority",
  "never_mutate_operational_state_without_reconciliation"
]);

export function assertNonOverridable(rule: ConstitutionalInvariantId): void {
  if (!NON_OVERRIDABLE_RULES.has(rule)) throw new Error(`rule_is_overridable:${rule}`);
}
