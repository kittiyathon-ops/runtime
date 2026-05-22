export type TruthConfidence = "HIGH_CONFIDENCE" | "DEGRADED_CONFIDENCE" | "DISPUTED_TRUTH" | "UNKNOWN_STATE";

export interface TruthConfidenceState {
  confidence: TruthConfidence;
  reason: string;
  positionSizeMultiplier: number;
  haltNewOrders: boolean;
  enterSafeMode: boolean;
}

export function truthConfidenceState(input: {
  causalUncertaintyCount: number;
  confidenceDowngradeCount: number;
  disputed: boolean;
  unknown: boolean;
}): TruthConfidenceState {
  if (input.unknown) {
    return {
      confidence: "UNKNOWN_STATE",
      reason: "truth_state_unknown",
      positionSizeMultiplier: 0,
      haltNewOrders: true,
      enterSafeMode: true
    };
  }
  if (input.disputed) {
    return {
      confidence: "DISPUTED_TRUTH",
      reason: "truth_disputed",
      positionSizeMultiplier: 0,
      haltNewOrders: true,
      enterSafeMode: false
    };
  }
  if (input.causalUncertaintyCount > 0 || input.confidenceDowngradeCount > 0) {
    return {
      confidence: "DEGRADED_CONFIDENCE",
      reason: "truth_confidence_degraded",
      positionSizeMultiplier: 0.5,
      haltNewOrders: false,
      enterSafeMode: false
    };
  }
  return {
    confidence: "HIGH_CONFIDENCE",
    reason: "truth_high_confidence",
    positionSizeMultiplier: 1,
    haltNewOrders: false,
    enterSafeMode: false
  };
}
