import { constitutionalBreach, type ConstitutionalBreach } from "./constitutional-breach.js";
import type { ConstitutionalInvariantId } from "./constitutional-invariants.js";

export interface ConstitutionalValidationInput {
  timestamp: number;
  traceId: string;
  subjectId: string;
  disputedReality: boolean;
  evidenceMutationAttempted: boolean;
  replayIntegrityBypassed: boolean;
  quarantineOverrideWithoutHumanReview: boolean;
  survivabilityThresholdViolated: boolean;
  executionOutsideGovernanceAuthority: boolean;
  operationalMutationWithoutReconciliation: boolean;
  evidenceIds: string[];
}

export interface ConstitutionalValidationResult {
  status: "PASSED" | "FAILED_CLOSED";
  breaches: ConstitutionalBreach[];
}

export class ConstitutionalValidator {
  validate(input: ConstitutionalValidationInput): ConstitutionalValidationResult {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    const pairs: Array<[boolean, ConstitutionalInvariantId, string]> = [
      [input.disputedReality, "never_execute_on_disputed_reality", "disputed_reality"],
      [input.evidenceMutationAttempted, "never_mutate_append_only_evidence", "evidence_mutation_attempted"],
      [input.replayIntegrityBypassed, "never_bypass_replay_integrity", "replay_integrity_bypassed"],
      [input.quarantineOverrideWithoutHumanReview, "never_override_quarantine_without_human_review", "quarantine_override_without_review"],
      [input.survivabilityThresholdViolated, "never_violate_survivability_threshold", "survivability_threshold_violated"],
      [input.executionOutsideGovernanceAuthority, "never_execute_outside_governance_authority", "governance_authority_missing"],
      [input.operationalMutationWithoutReconciliation, "never_mutate_operational_state_without_reconciliation", "reconciliation_missing"]
    ];
    const breaches = pairs
      .filter(([violated]) => violated)
      .map(([, invariantId, reason]) => constitutionalBreach({
        breachId: `${input.traceId}:${invariantId}`,
        invariantId,
        timestamp: input.timestamp,
        traceId: input.traceId,
        severity: "FATAL",
        reason,
        evidence: input.evidenceIds.map((evidenceId) => ({
          evidenceId,
          timestamp: input.timestamp,
          traceId: input.traceId,
          source: input.subjectId
        }))
      }));
    return { status: breaches.length === 0 ? "PASSED" : "FAILED_CLOSED", breaches };
  }
}
