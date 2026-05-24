export type Trend =
  | "LONG"
  | "SHORT"
  | "NEUTRAL";

export type Regime =
  | "TREND"
  | "RANGE"
  | "CHOP"
  | "SQUEEZE"
  | "PANIC"
  | "UNKNOWN";

export interface ScoreDetail {
  score: number;
  maxScore: number;
  status: string;
}

export interface ConfluenceScoreInput {
  regime: Regime;

  btcTrend: Trend;
  ethTrend: Trend;

  volume: number;
  avgVolume: number;

  liquiditySweep: boolean;
  reclaimDetected: boolean;

  spreadBps: number;
  volatilityBps: number;

  failedSignals: number;
}

export interface HardVetoResult {
  blocked: boolean;
  reasons: string[];
}

export interface ConfluenceScoreResult {

  total: number;

  threshold: number;

  maxScore: number;

  tradeWorthy: boolean;

  missingPoints: number;

  hardVeto: HardVetoResult;

  details: {
    regimeOK: ScoreDetail;
    btcEthAlign: ScoreDetail;
    volumeConfirm: ScoreDetail;
    sweepReclaim: ScoreDetail;
    spreadHealthy: ScoreDetail;
    volatilityAcceptable: ScoreDetail;
    noFailedStreak: ScoreDetail;
  };

  suggestions: string[];
}

export class EthConfluenceScoreCalculator {

  private readonly threshold = 7;

  private readonly maxScore = 11;

  calculate(
    input: ConfluenceScoreInput
  ): ConfluenceScoreResult {

    const details = {

      regimeOK:
        this.regimeOK(
          input.regime
        ),

      btcEthAlign:
        this.btcEthAlign(
          input.btcTrend,
          input.ethTrend
        ),

      volumeConfirm:
        this.volumeConfirm(
          input.volume,
          input.avgVolume
        ),

      sweepReclaim:
        this.sweepReclaim(
          input.liquiditySweep,
          input.reclaimDetected
        ),

      spreadHealthy:
        this.spreadHealthy(
          input.spreadBps
        ),

      volatilityAcceptable:
        this.volatilityAcceptable(
          input.volatilityBps
        ),

      noFailedStreak:
        this.noFailedStreak(
          input.failedSignals
        )
    };

    const total =
      Object.values(details)
        .reduce(
          (sum, item) =>
            sum + item.score,
          0
        );

    const missingPoints =
      Math.max(
        0,
        this.threshold - total
      );

    const hardVeto =
      this.hardVeto(
        input,
        details
      );

    return {

      total,

      threshold:
        this.threshold,

      maxScore:
        this.maxScore,

      tradeWorthy:
        total >= this.threshold &&
        !hardVeto.blocked,

      missingPoints,

      hardVeto,

      details,

      suggestions:
        this.suggestions(
          details
        )
    };
  }

  private regimeOK(
    regime: Regime
  ): ScoreDetail {

    if (
      regime === "TREND" ||
      regime === "RANGE"
    ) {

      return {
        score: 2,
        maxScore: 2,
        status: regime
      };
    }

    if (
      regime === "SQUEEZE"
    ) {

      return {
        score: 1,
        maxScore: 2,
        status: regime
      };
    }

    return {
      score: 0,
      maxScore: 2,
      status: regime
    };
  }

  private btcEthAlign(
    btc: Trend,
    eth: Trend
  ): ScoreDetail {

    if (
      btc !== "NEUTRAL" &&
      btc === eth
    ) {

      return {
        score: 2,
        maxScore: 2,
        status:
          `${btc}_ALIGNED`
      };
    }

    return {
      score: 0,
      maxScore: 2,
      status:
        `BTC_${btc}_ETH_${eth}`
    };
  }

  private volumeConfirm(
    volume: number,
    avgVolume: number
  ): ScoreDetail {

    if (
      avgVolume <= 0
    ) {

      return {
        score: 0,
        maxScore: 2,
        status:
          "NO_VOLUME_AVG"
      };
    }

    const ratio =
      volume / avgVolume;

    if (
      ratio >= 1.5
    ) {

      return {
        score: 2,
        maxScore: 2,
        status:
          `STRONG_${ratio.toFixed(2)}x`
      };
    }

    if (
      ratio >= 1.0
    ) {

      return {
        score: 1,
        maxScore: 2,
        status:
          `NORMAL_${ratio.toFixed(2)}x`
      };
    }

    return {
      score: 0,
      maxScore: 2,
      status:
        `WEAK_${ratio.toFixed(2)}x`
    };
  }

  private sweepReclaim(
    liquiditySweep: boolean,
    reclaimDetected: boolean
  ): ScoreDetail {

    if (
      liquiditySweep &&
      reclaimDetected
    ) {

      return {
        score: 2,
        maxScore: 2,
        status: "DETECTED"
      };
    }

    if (
      reclaimDetected
    ) {

      return {
        score: 1,
        maxScore: 2,
        status:
          "RECLAIM_ONLY"
      };
    }

    return {
      score: 0,
      maxScore: 2,
      status:
        "NOT_DETECTED"
    };
  }

  private spreadHealthy(
    spreadBps: number
  ): ScoreDetail {

    const threshold = 5;

    if (
      spreadBps <= threshold
    ) {

      return {
        score: 1,
        maxScore: 1,
        status:
          `${spreadBps.toFixed(4)}bps`
      };
    }

    return {
      score: 0,
      maxScore: 1,
      status:
        `${spreadBps.toFixed(4)}bps_TOO_WIDE`
    };
  }

  private volatilityAcceptable(
    volatilityBps: number
  ): ScoreDetail {

    const threshold = 250;

    if (
      volatilityBps <= threshold
    ) {

      return {
        score: 1,
        maxScore: 1,
        status:
          `${volatilityBps.toFixed(2)}bps`
      };
    }

    return {
      score: 0,
      maxScore: 1,
      status:
        `${volatilityBps.toFixed(2)}bps_TOO_HIGH`
    };
  }

  private noFailedStreak(
    failedSignals: number
  ): ScoreDetail {

    if (
      failedSignals < 3
    ) {

      return {
        score: 1,
        maxScore: 1,
        status:
          `CLEAN_${failedSignals}`
      };
    }

    return {
      score: 0,
      maxScore: 1,
      status:
        `FAILED_${failedSignals}`
    };
  }

  private hardVeto(
    input: ConfluenceScoreInput,
    details: ConfluenceScoreResult["details"]
  ): HardVetoResult {

    const reasons: string[] = [];

    const volumeRatio =
      input.avgVolume > 0
        ? input.volume /
          input.avgVolume
        : 0;

    if (
      input.regime ===
        "SQUEEZE" &&
      volumeRatio < 0.5
    ) {

      reasons.push(
        `LOW_VOLUME_SQUEEZE_${volumeRatio.toFixed(2)}x`
      );
    }

    if (
      details.volumeConfirm
        .score === 0
    ) {

      reasons.push(
        `VOLUME_CONFIRM_FAILED_${details.volumeConfirm.status}`
      );
    }

    if (
      details.spreadHealthy
        .score === 0
    ) {

      reasons.push(
        `SPREAD_UNHEALTHY_${details.spreadHealthy.status}`
      );
    }

    if (
      details.noFailedStreak
        .score === 0
    ) {

      reasons.push(
        `FAILED_STREAK_${details.noFailedStreak.status}`
      );
    }

    return {
      blocked:
        reasons.length > 0,
      reasons
    };
  }

  private suggestions(
    details:
      ConfluenceScoreResult["details"]
  ): string[] {

    const out: string[] = [];

    if (
      details.regimeOK.score <
      details.regimeOK.maxScore
    ) {

      out.push(
        `wait for better regime: ${details.regimeOK.status}`
      );
    }

    if (
      details.btcEthAlign.score <
      details.btcEthAlign.maxScore
    ) {

      out.push(
        `wait for BTC/ETH alignment: ${details.btcEthAlign.status}`
      );
    }

    if (
      details.volumeConfirm.score <
      details.volumeConfirm.maxScore
    ) {

      out.push(
        `wait for stronger volume: ${details.volumeConfirm.status}`
      );
    }

    if (
      details.sweepReclaim.score <
      details.sweepReclaim.maxScore
    ) {

      out.push(
        `wait for sweep + reclaim: ${details.sweepReclaim.status}`
      );
    }

    if (
      details.spreadHealthy.score <
      details.spreadHealthy.maxScore
    ) {

      out.push(
        `avoid wide spread: ${details.spreadHealthy.status}`
      );
    }

    if (
      details.volatilityAcceptable.score <
      details.volatilityAcceptable.maxScore
    ) {

      out.push(
        `avoid high volatility: ${details.volatilityAcceptable.status}`
      );
    }

    if (
      details.noFailedStreak.score <
      details.noFailedStreak.maxScore
    ) {

      out.push(
        `cooldown failed streak: ${details.noFailedStreak.status}`
      );
    }

    return out;
  }
}