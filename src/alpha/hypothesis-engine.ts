export interface AlphaHypothesis {
  readonly id: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly kind: "RSI_MEAN_REVERSION";
  readonly params: {
    readonly rsiPeriod: number;
    readonly buyBelow: number;
    readonly exitAbove: number;
  };
}

export class HypothesisEngine {
  constructor(
    private readonly config: {
      readonly batchSize: number;
    }
  ) {}

  generateBatch(input: {
    readonly symbols: readonly string[];
    readonly timeframes: readonly string[];
    readonly count?: number;
  }): readonly AlphaHypothesis[] {
    const count = input.count ?? this.config.batchSize;
    const hypotheses: AlphaHypothesis[] = [];

    for (let index = 0; index < count; index += 1) {
      const symbol = input.symbols[index % input.symbols.length] ?? "ETHUSDT";
      const timeframe = input.timeframes[index % input.timeframes.length] ?? "1m";

      hypotheses.push({
        id: `rsi_mean_reversion_${symbol}_${timeframe}_${index}`,
        symbol,
        timeframe,
        kind: "RSI_MEAN_REVERSION",
        params: {
          rsiPeriod: 14,
          buyBelow: 30 + (index % 5),
          exitAbove: 65 + (index % 10)
        }
      });
    }

    return hypotheses;
  }
}
