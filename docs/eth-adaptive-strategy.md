# ETH Adaptive Strategy

Purpose: reduce bad trades during current ETH market conditions.

## What it does

- Detects market regime: TREND, RANGE, CHOP, SQUEEZE, PANIC, UNKNOWN
- Rejects toxic spread / volatility
- Rejects high-wick fake breakout
- Rejects breakout without follow-through
- Requires volume confirmation
- Prefers liquidity sweep + reclaim
- Blocks ETH long if BTC trend is bearish
- Blocks ETH short if BTC trend is bullish
- Reduces position size in bad regimes
- Uses caller-driven post-loss cooldown

## Safety

This file does not place orders.

It only returns a decision:

- allow trade
- reject trade
- side
- confidence
- position size multiplier
- reason

Existing runtime risk/governance gates must still be used.

## Test flow

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm smoke:paper