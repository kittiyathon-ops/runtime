export interface TemporalDecisionInput {
  decisionTimestamp: number;
  latestKnownTimestamp: number;
  replayDrift: number;
  traceId: string;
}

export interface TemporalValidationResult {
  status: "VALID" | "REJECTED";
  reasons: string[];
}

export class TemporalValidator {
  validate(input: TemporalDecisionInput): TemporalValidationResult {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    const reasons: string[] = [];
    if (input.decisionTimestamp > input.latestKnownTimestamp) reasons.push("future_state_execution");
    if (input.replayDrift !== 0) reasons.push("replay_drift");
    return { status: reasons.length === 0 ? "VALID" : "REJECTED", reasons };
  }
}
