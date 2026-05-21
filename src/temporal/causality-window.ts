export interface CausalityWindowDecision {
  accepted: boolean;
  reason: string;
  lagMs: number;
}

export class CausalityWindow {
  constructor(private readonly maxLagMs: number) {
    if (maxLagMs < 0) throw new Error("causality_window_invalid");
  }

  evaluate(eventTimestamp: number, decisionTimestamp: number): CausalityWindowDecision {
    if (decisionTimestamp < eventTimestamp) return { accepted: false, reason: "future_state_contamination", lagMs: decisionTimestamp - eventTimestamp };
    const lagMs = decisionTimestamp - eventTimestamp;
    return lagMs <= this.maxLagMs
      ? { accepted: true, reason: "within_causality_window", lagMs }
      : { accepted: false, reason: "delayed_causality", lagMs };
  }
}
