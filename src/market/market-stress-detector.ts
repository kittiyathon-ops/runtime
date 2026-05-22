export type MarketStressState =
  | "NORMAL"
  | "THIN_LIQUIDITY"
  | "TOXIC_FLOW"
  | "STALE_MARKET"
  | "CHAOTIC";

export interface MarketStressSnapshot {
  readonly symbol: string;
  readonly bestBid: number;
  readonly bestAsk: number;
  readonly spreadBps: number;
  readonly topBidDepthUsd: number;
  readonly topAskDepthUsd: number;
  readonly imbalanceRatio: number;
  readonly volatilityBps: number;
  readonly cancelRatePerSecond: number;
  readonly eventLagMs: number;
  readonly observedAtMs: number;
}

export interface MarketStressReport {
  readonly state: MarketStressState;
  readonly survivable: boolean;
  readonly executionConstraint: "ALLOW" | "PASSIVE_ONLY" | "THROTTLE" | "HALT";
  readonly reasons: readonly string[];
  readonly metrics: {
    readonly spreadBps: number;
    readonly imbalanceRatio: number;
    readonly topBookDepthUsd: number;
    readonly eventLagMs: number;
    readonly volatilityBps: number;
    readonly cancelRatePerSecond: number;
  };
  readonly detectedAtMs: number;
}

export interface MarketStressThresholds {
  readonly maxSpreadBps: number;
  readonly minTopBookDepthUsd: number;
  readonly maxEventLagMs: number;
  readonly toxicImbalanceRatio: number;
  readonly toxicVolatilityBps: number;
  readonly chaoticCancelRate: number;
}

export const DEFAULT_MARKET_STRESS_THRESHOLDS: MarketStressThresholds = {
  maxSpreadBps: 8,
  minTopBookDepthUsd: 5000,
  maxEventLagMs: 2000,
  toxicImbalanceRatio: 0.85,
  toxicVolatilityBps: 40,
  chaoticCancelRate: 120
};

export function evaluateMarketStress(
  snapshot: MarketStressSnapshot,
  thresholds: MarketStressThresholds = DEFAULT_MARKET_STRESS_THRESHOLDS
): MarketStressReport {
  const topBookDepthUsd = Math.min(snapshot.topBidDepthUsd, snapshot.topAskDepthUsd);

  if (snapshot.eventLagMs > thresholds.maxEventLagMs) {
    return report(snapshot, "STALE_MARKET", false, "HALT", ["event_lag_exceeded"], topBookDepthUsd);
  }

  if (snapshot.cancelRatePerSecond > thresholds.chaoticCancelRate) {
    return report(snapshot, "CHAOTIC", false, "HALT", ["cancel_storm_detected"], topBookDepthUsd);
  }

  if (snapshot.spreadBps > thresholds.maxSpreadBps && topBookDepthUsd < thresholds.minTopBookDepthUsd) {
    return report(snapshot, "THIN_LIQUIDITY", true, "PASSIVE_ONLY", ["thin_liquidity_detected"], topBookDepthUsd);
  }

  if (Math.abs(snapshot.imbalanceRatio) > thresholds.toxicImbalanceRatio && snapshot.volatilityBps > thresholds.toxicVolatilityBps) {
    return report(snapshot, "TOXIC_FLOW", true, "THROTTLE", ["toxic_flow_detected"], topBookDepthUsd);
  }

  return report(snapshot, "NORMAL", true, "ALLOW", ["market_conditions_normal"], topBookDepthUsd);
}

function report(
  snapshot: MarketStressSnapshot,
  state: MarketStressState,
  survivable: boolean,
  executionConstraint: "ALLOW" | "PASSIVE_ONLY" | "THROTTLE" | "HALT",
  reasons: readonly string[],
  topBookDepthUsd: number
): MarketStressReport {
  return {
    state,
    survivable,
    executionConstraint,
    reasons,
    metrics: {
      spreadBps: snapshot.spreadBps,
      imbalanceRatio: snapshot.imbalanceRatio,
      topBookDepthUsd,
      eventLagMs: snapshot.eventLagMs,
      volatilityBps: snapshot.volatilityBps,
      cancelRatePerSecond: snapshot.cancelRatePerSecond
    },
    detectedAtMs: snapshot.observedAtMs
  };
}
