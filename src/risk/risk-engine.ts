import type { RuntimeConfig } from "../infra/config.js";
import type { RuntimeEvent } from "../core/event.js";
import type { PortfolioState } from "../portfolio/portfolio-state.js";

export interface RiskDecision {
  allow: boolean;
  reason?: string;
}

export interface RiskState {
  killSwitch: boolean;
  safeModeReason?: string;
  orderRejects: number;
  orderSubmits: number;
  lastMarketTimestamp?: number;
}

export class RiskEngine {
  private readonly state: RiskState = {
    killSwitch: false,
    orderRejects: 0,
    orderSubmits: 0
  };

  constructor(
    private readonly config: Pick<RuntimeConfig, "maxExposureUsd" | "maxRejectRate" | "staleDataHaltMs" | "latencyHaltMs" | "maxDrawdownUsd">,
    private readonly portfolio: PortfolioState
  ) {}

  observe(event: RuntimeEvent): RiskDecision {
    if (event.eventType === "MARKET_TICK" || event.eventType === "BOOK_UPDATE") {
      this.state.lastMarketTimestamp = event.receiveTimestamp ?? event.timestamp;
    }
    if (event.eventType === "ORDER_SUBMITTED") this.state.orderSubmits += 1;
    if (event.eventType === "ORDER_REJECTED") this.state.orderRejects += 1;

    const rejectionRate = this.state.orderSubmits === 0 ? 0 : this.state.orderRejects / this.state.orderSubmits;
    if (rejectionRate > this.config.maxRejectRate) {
      return this.halt("rejection_rate_halt");
    }
    if (this.portfolio.exposureUsd() > this.config.maxExposureUsd) {
      return this.halt("max_exposure_halt");
    }
    return this.currentDecision();
  }

  evaluateIntent(event: RuntimeEvent, nowMs: number): RiskDecision {
    if (this.state.killSwitch) return this.currentDecision();
    if (event.eventType !== "INTENT_CREATED") return { allow: true };
    if (!this.state.lastMarketTimestamp || nowMs - this.state.lastMarketTimestamp > this.config.staleDataHaltMs) {
      return this.halt("stale_data_halt");
    }
    const latency = (event.processingTimestamp ?? event.timestamp) - (event.receiveTimestamp ?? event.timestamp);
    if (latency > this.config.latencyHaltMs) {
      return this.halt("latency_halt");
    }
    return { allow: true };
  }

  halt(reason: string): RiskDecision {
    this.state.killSwitch = true;
    this.state.safeModeReason = reason;
    return { allow: false, reason };
  }

  snapshot(): RiskState {
    return { ...this.state };
  }

  private currentDecision(): RiskDecision {
    if (!this.state.killSwitch) return { allow: true };
    return this.state.safeModeReason
      ? { allow: false, reason: this.state.safeModeReason }
      : { allow: false };
  }
}
