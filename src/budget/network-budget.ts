export interface NetworkBudgetSample {
  inboundMessagesPerSecond: number;
  outboundRequestsPerSecond: number;
  maxInboundMessagesPerSecond: number;
  maxOutboundRequestsPerSecond: number;
}

export interface NetworkBudgetDecision {
  status: "OK" | "THROTTLE" | "SAFE_MODE";
  reason: string;
}

export class NetworkBudget {
  evaluate(sample: NetworkBudgetSample): NetworkBudgetDecision {
    if (sample.maxInboundMessagesPerSecond <= 0 || sample.maxOutboundRequestsPerSecond <= 0) throw new Error("network_budget_invalid");
    if (sample.inboundMessagesPerSecond > sample.maxInboundMessagesPerSecond * 2) {
      return { status: "SAFE_MODE", reason: "exchange_flood_exceeds_processing_guarantee" };
    }
    if (sample.inboundMessagesPerSecond > sample.maxInboundMessagesPerSecond || sample.outboundRequestsPerSecond > sample.maxOutboundRequestsPerSecond) {
      return { status: "THROTTLE", reason: "network_budget_exceeded" };
    }
    return { status: "OK", reason: "network_budget_ok" };
  }
}
