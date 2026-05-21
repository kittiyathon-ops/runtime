# Simple Trend Following Strategy

## Scope

`SimpleTrendFollowingStrategy` is a minimal deterministic strategy adapter for the existing signal-to-intent pipeline. It is not an execution engine and does not mutate runtime, portfolio, governance, or replay state directly.

## Integration Notes

- File: `src/strategies/simple-trend-strategy.ts`
- Register the instance with `TradingRuntime.registerSignalStrategy(strategy)`.
- `registerSignalStrategy()` registers both deterministic market-signal evaluation and signal-to-intent conversion.
- Canonical flow is `MARKET_TICK -> SIGNAL_CREATED -> INTENT_CREATED -> governance/risk validation -> execution pipeline`.
- The runtime governance and risk layers remain authoritative. Strategy-level checks are pre-flight intent constraints, not a replacement for governance.

## Runtime Registration Example

```ts
import { TradingRuntime } from "../runtime/runtime.js";
import { SimpleTrendFollowingStrategy } from "../strategies/simple-trend-strategy.js";

const runtime = new TradingRuntime();
runtime.registerSignalStrategy(new SimpleTrendFollowingStrategy({
  accountEquityUsd: "10000",
  maxExposureUsd: "1000",
  maxDailyLossUsd: "100",
  maxOrderNotionalUsd: "50",
  minTrendStrengthBps: "50",
  minQuantity: "0.001",
  quantityStepSize: "0.001",
  orderType: "MARKET"
}));
```

## Intent Creation Example

```ts
{
  eventType: "INTENT_CREATED",
  eventId: "intent:composite_signal_to_intent:52",
  payload: {
    policyId: "composite_signal_to_intent",
    strategyId: "simple_trend_following_v1",
    side: "BUY",
    type: "MARKET",
    quantity: "0.312",
    riskPctOfEquity: "0.01",
    strategyReason: "LONG SMA20/SMA50 crossover with volume confirmation",
    replayMetadata: {
      sourceSignalSeq: 52,
      observationSeq: 51
    }
  }
}
```

## Signal Rules

- SMA20 crossing above SMA50 creates a `LONG` bias.
- SMA20 crossing below SMA50 creates a `SHORT` bias.
- Current volume must be greater than the previous rolling average volume.
- Absolute SMA20/SMA50 distance in basis points must meet `minTrendStrengthBps`.
- Duplicate intents are suppressed while the bias remains unchanged.

## Risk Rules

- Strategy notional is capped by `accountEquityUsd * 0.01`.
- Strategy notional is also capped by `maxOrderNotionalUsd` and remaining `maxExposureUsd`.
- `dailyLossUsd >= maxDailyLossUsd` rejects intent conversion.
- Quantity is decimal-derived and optionally floored to `quantityStepSize`.

## Replay Safety Notes

- Indicator state is reconstructed only from canonical market events.
- No wall-clock input participates in signal calculation.
- No external IO, exchange reads, persistence writes, notifications, or retries occur inside strategy evaluation.
- Financial calculations use `PrecisionMath` decimal-string operations.
- Missing risk context is rejected rather than silently defaulted during signal-to-intent conversion.
