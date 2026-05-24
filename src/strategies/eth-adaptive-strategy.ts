export type EthMarketRegime =
  | "TREND"
  | "RANGE"
  | "CHOP"
  | "SQUEEZE"
  | "PANIC"
  | "UNKNOWN";

export interface EthMarketSnapshot {
  ethPrice: number;
  btcPrice: number;

  ethVolume: number;
  avgVolume: number;

  spreadBps: number;
  volatilityBps: number;

  wickRatio: number;

  breakoutDetected: boolean;
  followThrough: boolean;

  liquiditySweep: boolean;
  reclaimDetected: boolean;

  btcTrend: "LONG" | "SHORT" | "NEUTRAL";
  ethTrend: "LONG" | "SHORT" | "NEUTRAL";

  failedSignals: number;
}

export interface StrategyDecision {
  allowTrade: boolean;

  side?: "LONG" | "SHORT";

  regime: EthMarketRegime;

  confidence: number;

  positionSizeMultiplier: number;

  reason: string;

  cooldownActive: boolean;
}

export class EthAdaptiveStrategy {
  private consecutiveLosses = 0;

  private cooldownUntil = 0;

  evaluate(
    market: EthMarketSnapshot,
    nowMs: number
  ): StrategyDecision {

    if (nowMs < this.cooldownUntil) {
      return {
        allowTrade: false,
        regime: "UNKNOWN",
        confidence: 0,
        positionSizeMultiplier: 0,
        cooldownActive: true,
        reason: "POST_LOSS_COOLDOWN"
      };
    }

    const regime = this.detectRegime(market);

    if (
      market.spreadBps > 8 ||
      market.volatilityBps > 250
    ) {
      return this.reject(
        regime,
        "TOXIC_MARKET_CONDITIONS"
      );
    }

    if (
      market.failedSignals >= 3
    ) {
      return this.reject(
        regime,
        "TOO_MANY_FAILED_SIGNALS"
      );
    }

    if (
      market.breakoutDetected &&
      market.wickRatio > 0.65
    ) {
      return this.reject(
        regime,
        "HIGH_WICK_FAKE_BREAKOUT"
      );
    }

    if (
      market.breakoutDetected &&
      !market.followThrough
    ) {
      return this.reject(
        regime,
        "NO_FOLLOW_THROUGH"
      );
    }

    if (
      market.ethVolume <
      market.avgVolume * 1.1
    ) {
      return this.reject(
        regime,
        "WEAK_VOLUME_CONFIRMATION"
      );
    }

    let side: "LONG" | "SHORT" | undefined;

    const reclaimLong =
      market.liquiditySweep &&
      market.reclaimDetected &&
      market.ethTrend === "LONG";

    const reclaimShort =
      market.liquiditySweep &&
      market.reclaimDetected &&
      market.ethTrend === "SHORT";

    if (
      reclaimLong &&
      market.btcTrend !== "SHORT"
    ) {
      side = "LONG";
    }

    if (
      reclaimShort &&
      market.btcTrend !== "LONG"
    ) {
      side = "SHORT";
    }

    if (!side) {
      return this.reject(
        regime,
        "NO_VALID_ETH_SETUP"
      );
    }

    const positionSizeMultiplier =
      this.sizeForRegime(regime);

    return {
      allowTrade: true,
      side,
      regime,
      confidence: this.confidenceFor(regime),
      positionSizeMultiplier,
      cooldownActive: false,
      reason: "VALID_ETH_RECLAIM_SETUP"
    };
  }

  recordTradeResult(
    pnlUsd: number,
    nowMs: number
  ): void {

    if (pnlUsd < 0) {
      this.consecutiveLosses += 1;
    } else {
      this.consecutiveLosses = 0;
    }

    if (this.consecutiveLosses >= 2) {
      this.cooldownUntil =
        nowMs + 60_000;
    }
  }

  private detectRegime(
    market: EthMarketSnapshot
  ): EthMarketRegime {

    if (market.volatilityBps > 250) {
      return "PANIC";
    }

    if (
      market.ethTrend === market.btcTrend &&
      market.followThrough
    ) {
      return "TREND";
    }

    if (
      market.volatilityBps < 80
    ) {
      return "SQUEEZE";
    }

    if (
      market.wickRatio > 0.7
    ) {
      return "CHOP";
    }

    return "RANGE";
  }

  private sizeForRegime(
    regime: EthMarketRegime
  ): number {

    switch (regime) {

      case "TREND":
        return 1.0;

      case "RANGE":
        return 0.5;

      case "SQUEEZE":
        return 0.4;

      case "CHOP":
        return 0.25;

      case "PANIC":
        return 0.1;

      default:
        return 0.1;
    }
  }

  private confidenceFor(
    regime: EthMarketRegime
  ): number {

    switch (regime) {

      case "TREND":
        return 0.85;

      case "RANGE":
        return 0.65;

      case "SQUEEZE":
        return 0.55;

      default:
        return 0.4;
    }
  }

  private reject(
    regime: EthMarketRegime,
    reason: string
  ): StrategyDecision {

    return {
      allowTrade: false,
      regime,
      confidence: 0,
      positionSizeMultiplier: 0,
      cooldownActive: false,
      reason
    };
  }
}