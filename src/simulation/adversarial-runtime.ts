export type AdversarialDomain =
  | "fake_reality"
  | "forged_provenance"
  | "temporal_corruption"
  | "replay_divergence"
  | "governance_poisoning"
  | "capability_escalation"
  | "delayed_truth_injection"
  | "stale_valid_observation"
  | "confidence_spoofing"
  | "identity_drift_attack"
  | "quarantine_bypass"
  | "timeline_desynchronization";

export interface AdversarialScenario {
  scenarioId: string;
  domain: AdversarialDomain;
  timestamp: number;
  traceId: string;
  evidenceIds: string[];
  expectedContainment: "REJECT" | "QUARANTINE" | "SAFE_MODE" | "HALT";
}

export interface AdversarialResult {
  scenarioId: string;
  contained: boolean;
  action: AdversarialScenario["expectedContainment"];
  reason: string;
}

export class AdversarialRuntime {
  run(scenario: AdversarialScenario, observedAction: AdversarialScenario["expectedContainment"]): AdversarialResult {
    if (scenario.traceId.length === 0) throw new Error("trace_id_required");
    if (scenario.evidenceIds.length === 0) throw new Error("adversarial_scenario_requires_evidence");
    const contained = observedAction === scenario.expectedContainment;
    return {
      scenarioId: scenario.scenarioId,
      contained,
      action: observedAction,
      reason: contained ? "expected_containment_preserved" : "containment_mismatch"
    };
  }
}
