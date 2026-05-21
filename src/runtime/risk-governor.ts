import type { RuntimeEvent } from "../core/event.js";

export type RiskRecommendation = "OK" | "REDUCE_ONLY" | "PASSIVE_ONLY" | "SAFE_MODE" | "HALT" | "KILL_SWITCH";

export interface RiskGovernorThresholds {
  maxExposureUsd: number;
  maxLeverage: number;
  maxDrawdownUsd: number;
  rejectRateWarn: number;
  rejectRateCritical: number;
  volatilityWarn: number;
  volatilityCritical: number;
}

export interface RiskGovernorInput {
  exposureUsd: number;
  equityUsd: number;
  drawdownUsd: number;
  orderRejectRate: number;
  volatilityBps: number;
  replayConsistent: boolean;
  persistenceStable: boolean;
}

export interface RiskGovernorEvent {
  source: "risk_governor";
  recommendation: RiskRecommendation;
  reason: string;
  observedValue?: number;
  threshold?: number;
}

export interface RiskGovernorDecision {
  recommendation: RiskRecommendation;
  events: RiskGovernorEvent[];
}

export class RiskGovernor {
  constructor(private readonly thresholds: RiskGovernorThresholds) {}

  evaluate(input: RiskGovernorInput): RiskGovernorDecision {
    const events: RiskGovernorEvent[] = [];
    const add = (recommendation: RiskRecommendation, reason: string, observedValue?: number, threshold?: number): void => {
      events.push({
        source: "risk_governor",
        recommendation,
        reason,
        ...(observedValue === undefined ? {} : { observedValue }),
        ...(threshold === undefined ? {} : { threshold })
      });
    };

    const leverage = input.equityUsd <= 0 ? Number.POSITIVE_INFINITY : input.exposureUsd / input.equityUsd;
    if (input.exposureUsd > this.thresholds.maxExposureUsd) {
      add("REDUCE_ONLY", "max_exposure_breach", input.exposureUsd, this.thresholds.maxExposureUsd);
    }
    if (leverage > this.thresholds.maxLeverage) {
      add("SAFE_MODE", "max_leverage_breach", leverage, this.thresholds.maxLeverage);
    }
    if (input.drawdownUsd > this.thresholds.maxDrawdownUsd) {
      add("HALT", "max_drawdown_breach", input.drawdownUsd, this.thresholds.maxDrawdownUsd);
    }
    if (input.orderRejectRate >= this.thresholds.rejectRateCritical) {
      add("KILL_SWITCH", "reject_rate_critical", input.orderRejectRate, this.thresholds.rejectRateCritical);
    } else if (input.orderRejectRate >= this.thresholds.rejectRateWarn) {
      add("PASSIVE_ONLY", "reject_rate_warn", input.orderRejectRate, this.thresholds.rejectRateWarn);
    }
    if (input.volatilityBps >= this.thresholds.volatilityCritical) {
      add("SAFE_MODE", "volatility_critical", input.volatilityBps, this.thresholds.volatilityCritical);
    } else if (input.volatilityBps >= this.thresholds.volatilityWarn) {
      add("PASSIVE_ONLY", "volatility_warn", input.volatilityBps, this.thresholds.volatilityWarn);
    }
    if (!input.replayConsistent) add("HALT", "replay_inconsistent");
    if (!input.persistenceStable) add("HALT", "persistence_unstable");

    return {
      recommendation: events.reduce<RiskRecommendation>((current, event) =>
        this.rank(event.recommendation) > this.rank(current) ? event.recommendation : current, "OK"),
      events
    };
  }

  toRuntimeEvents(decision: RiskGovernorDecision, causationEvent: RuntimeEvent, nextSeq: () => number, nowMs: number): RuntimeEvent[] {
    return decision.events.map((event) => ({
      seq: nextSeq(),
      timestamp: nowMs,
      receiveTimestamp: nowMs,
      processingTimestamp: nowMs,
      source: "risk",
      symbol: causationEvent.symbol,
      eventType: "RISK_ALERT",
      correlationId: causationEvent.correlationId,
      causationId: String(causationEvent.seq),
      payload: { ...event }
    }));
  }

  private rank(recommendation: RiskRecommendation): number {
    return { OK: 0, PASSIVE_ONLY: 1, REDUCE_ONLY: 2, SAFE_MODE: 3, HALT: 4, KILL_SWITCH: 5 }[recommendation];
  }
}
