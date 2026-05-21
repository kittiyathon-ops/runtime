export interface BackpressureInput {
  queueDepth: number;
  queueCapacity: number;
  executionCritical: boolean;
}

export interface BackpressureDecision {
  action: "ACCEPT" | "THROTTLE_COGNITION" | "REJECT_NON_CRITICAL" | "SAFE_MODE";
  reason: string;
  saturation: number;
}

export class BackpressureHandler {
  constructor(private readonly throttleAt = 0.7, private readonly rejectAt = 0.9) {}

  decide(input: BackpressureInput): BackpressureDecision {
    if (input.queueCapacity <= 0 || input.queueDepth < 0) throw new Error("backpressure_input_invalid");
    const saturation = input.queueDepth / input.queueCapacity;
    if (saturation >= 1) return { action: "SAFE_MODE", reason: "queue_saturated", saturation };
    if (saturation >= this.rejectAt && !input.executionCritical) {
      return { action: "REJECT_NON_CRITICAL", reason: "preserve_execution_integrity", saturation };
    }
    if (saturation >= this.throttleAt) {
      return { action: "THROTTLE_COGNITION", reason: "degrade_cognition_before_execution", saturation };
    }
    return { action: "ACCEPT", reason: "capacity_available", saturation };
  }
}
