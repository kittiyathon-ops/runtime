export interface AlphaDataConfig {
  readonly symbols: readonly string[];
  readonly timeframes: readonly string[];
}

export interface AlphaHypothesisConfig {
  readonly batchSize: number;
}

export interface AlphaValidationConfig {
  readonly minTrades: number;
  readonly minSharpeRatio: number;
  readonly minNetExpectancyPct: number;
}

export class AlphaConfig {
  readonly data: AlphaDataConfig = {
    symbols: ["ETHUSDT"],
    timeframes: ["1m", "5m"]
  };

  readonly hypothesis: AlphaHypothesisConfig = {
    batchSize: 10
  };

  readonly validation: AlphaValidationConfig = {
    minTrades: 5,
    minSharpeRatio: 0.5,
    minNetExpectancyPct: 0.02
  };
}
