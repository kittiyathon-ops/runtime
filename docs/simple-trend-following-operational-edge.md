# Simple Trend Following Operational Edge

## Scope

`SimpleTrendFollowingStrategy` is a minimal deterministic strategy for producing replay-safe trade intents from canonical `MARKET_TICK` events. It is not an execution engine and it does not mutate runtime, governance, risk, or portfolio state.

The edge is intentionally small:

- SMA20 above SMA50 creates a long bias.
- SMA20 below SMA50 creates a short bias.
- Entries require volume confirmation, minimum trend separation, acceptable volatility, and healthy operational context.
- Exits are deterministic: trend reversal, trailing stop, volatility expansion, or max-hold timeout.

## Runtime Registration

```ts
import { SimpleTrendFollowingStrategy } from "./src/strategies/simple-trend-following.js";

runtime.registerSignalStrategy(new SimpleTrendFollowingStrategy({
  symbol: "BTCUSDT",
  accountEquityUsd: "1000",
  maxRiskPerTradeBps: "100",
  maxExposureUsd: "250",
  maxDailyLossUsd: "50",
  minTrendSeparationBps: "5",
  minVolatilityBps: "2",
  maxVolatilityBps: "500",
  maxSpreadBps: "8",
  minFeedConfidence: "0.95",
  minGovernanceConfidence: "0.95",
  minSurvivabilityScore: "0.9",
  volumeLookback: 20,
  maxHoldBars: 120,
  trailingStopBps: "50",
  minQuantity: "0.001",
  quantityStep: "0.001",
  priceTick: "0.1",
  orderType: "MARKET"
}));
```

## Signal Flow

The runtime flow remains:

`MARKET_TICK -> SIGNAL_CREATED -> INTENT_CREATED -> governance/risk validation -> execution pipeline`

The strategy emits `SIGNAL_CREATED` candidates during market event evaluation. It converts only its own signals into `INTENT_CREATED` decisions when the `SignalEngine` invokes the strategy policy path. Governance and risk remain authoritative after the intent is emitted.

## Intent Shape

Each intent includes deterministic metadata:

- Stable strategy ID: `simple_trend_following_operational_v1`
- Signal reason and confidence
- SMA, volume, volatility, spread, and operational health snapshot
- Market timestamp derived from the source event
- Replay-safe identifier derived from symbol, sequence, bias, action, and source event ID
- Passive alpha measurement placeholders for MAE, MFE, fill drift, slippage, signal-to-fill latency, and expectancy

The strategy never places orders directly.

## Replay Safety

Replay output is deterministic because:

- All indicators are derived from canonical market events.
- No wall-clock time is read by the strategy.
- No external IO occurs in strategy evaluation.
- Intent timestamps come from market event payloads.
- IDs are stable hashes of replay-visible inputs.
- Per-symbol rolling state is reconstructed by replaying the same event sequence.

Operational context such as feed confidence, survivability score, spread, and exchange instability must be supplied as event payload data. Hidden runtime state is not consulted.

## Risk And Governance Integration

The strategy applies only first-line sizing constraints:

- Per-trade risk is capped by `maxRiskPerTradeBps`.
- Notional is capped by `maxExposureUsd - currentExposureUsd`.
- Entries are refused when `dailyLossUsd >= maxDailyLossUsd`.
- Exit intents are reduce-only.

Final exposure, leverage, daily loss, exchange confidence, hibernation, and governance halt decisions remain centralized in the existing governance and execution pipeline.

## Operational Assumptions

- Market events include deterministic `price` and `volume`.
- Optional operational fields are supplied by upstream runtime systems: `spreadBps`, `feedConfidence`, `governanceConfidence`, `survivabilityScore`, and `exchangeInstability`.
- Position-aware exits require replay-visible position context in the event payload: `activePositionSide`, `activePositionEntryPrice`, `activePositionQuantity`, and `activePositionOpenedSeq`.
- If position context is absent, the strategy can still emit entry intents but will not invent hidden position state.

## Failure Modes

- Insufficient history: no signal until SMA50 and rolling volume windows are populated.
- Weak trend: no entry when SMA separation is below threshold.
- Low or abnormal volatility: no entry under very quiet or spike conditions.
- Wide spread: no entry when spread exceeds configured limit.
- Degraded operational context: no entry when feed, governance, survivability, or exchange stability data indicates unsafe conditions.
- Max daily loss or max exposure reached: no entry intent is emitted.
- Exit trigger conflict: deterministic priority is trend reversal, trailing stop, volatility expansion, then max-hold timeout.

All refusals are explicit decision reasons, not silent fallbacks.
