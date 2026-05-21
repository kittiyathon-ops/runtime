# Live Binance Constrained Runbook

This runtime is safe by default: `RUNTIME_PROFILE=PAPER` and `DRY_RUN=true`. Mainnet live trading remains blocked unless an operator manually opens every live gate. Real mainnet mode trades real money.

## A. Install, Build, And Test

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

## B. PAPER Runtime

```powershell
$env:RUNTIME_PROFILE="PAPER"
$env:DRY_RUN="true"
$env:KILL_SWITCH="false"
$env:ALLOW_MARKET_ORDERS="false"
$env:MAX_ORDER_NOTIONAL_USD="10"
$env:MAX_EXPOSURE_USD="25"
$env:MAX_DAILY_LOSS_USD="10"
$env:MAX_LEVERAGE="1"
pnpm start
```

Expected proof: startup logs include `runtime.start() profile=PAPER dryRun=true`, no Binance credentials are required, and no `/fapi/v1/order` request can be sent.

## C. PAPER Smoke Test

```powershell
pnpm smoke:paper
```

Expected proof: output contains `PAPER_SMOKE_OK`, `restOrderSent: false`, and a canonical `ORDER_SUBMITTED` event.

## Binance Endpoint Categories

Do not mix these surfaces:

| Category | Purpose | Production | Testnet |
| --- | --- | --- | --- |
| REST API | Signed order/account calls and listenKey lifecycle | `https://fapi.binance.com` | `https://demo-fapi.binance.com` |
| Market stream base | Public market data websocket streams | `wss://fstream.binance.com` | `wss://stream.binancefuture.com` |
| User stream base | listenKey user-data websocket stream | `wss://fstream.binance.com/private` | `wss://stream.binancefuture.com` |
| WebSocket API | JSON request/response API, for example `order.place` | `wss://ws-fapi.binance.com/ws-fapi/v1` | `wss://testnet.binancefuture.com/ws-fapi/v1` |

This repo places orders through REST only. It does not use the WebSocket API for order placement. User data streams are created by REST `POST /fapi/v1/listenKey` and connected as:

```text
<BINANCE_FUTURES_USER_STREAM_BASE_URL>/ws/<listenKey>
```

Market streams are separate from listenKey streams. The runtime routes regular public streams through `/public/ws/<streamName>` and mark-price streams through `/market/ws/<streamName>`. A production listenKey stream must use the `/private` route in the base URL. The runtime fails closed in `LIVE` if testnet mode contains production endpoints, or production mode contains testnet endpoints.

## D. TESTNET Readiness Check

Use only Binance USD-M Futures testnet credentials. This check reads exchange/account state only and does not place orders.

```powershell
$env:RUNTIME_PROFILE="LIVE"
$env:DRY_RUN="false"
$env:BINANCE_USE_TESTNET="true"
$env:BINANCE_FUTURES_REST_URL="https://demo-fapi.binance.com"
$env:BINANCE_FUTURES_USER_STREAM_BASE_URL="wss://stream.binancefuture.com"
$env:BINANCE_FUTURES_MARKET_WS_BASE_URL="wss://stream.binancefuture.com"
$env:BINANCE_FUTURES_WS_API_URL="wss://testnet.binancefuture.com/ws-fapi/v1"
$env:BINANCE_SYMBOLS="BTCUSDT"
$env:BINANCE_API_KEY="<testnet-key>"
$env:BINANCE_API_SECRET="<testnet-secret>"
$env:LIVE_TRADING_CONFIRMATION="I_UNDERSTAND_THIS_TRADES_REAL_MONEY"
$env:KILL_SWITCH="false"
$env:ALLOW_MARKET_ORDERS="false"
$env:MAX_ORDER_NOTIONAL_USD="10"
$env:MAX_EXPOSURE_USD="25"
$env:MAX_DAILY_LOSS_USD="10"
$env:MAX_LEVERAGE="1"
pnpm readiness:testnet
```

Expected proof: output contains `TESTNET_READINESS_OK`, `orderPlaced: false`, all resolved endpoint URLs, BTCUSDT filters, and a balance/account read count.

## E. Optional TESTNET Tiny Limit Order

This places exactly one testnet-only USD-M Futures `LIMIT` order with `timeInForce=GTX` post-only. It refuses production REST URLs and refuses to run unless `ALLOW_TESTNET_TINY_ORDER=true`.

```powershell
$env:ALLOW_TESTNET_TINY_ORDER="true"
pnpm order:testnet:tiny
```

Expected proof: output contains `TESTNET_TINY_LIMIT_SENT`, `orderPlaced: true`, `postOnly: GTX`, the testnet REST base URL, request quantity/price/notional, and Binance's response.

## F. Mainnet Remains Blocked

Do not set production keys in `.env`. Mainnet orders remain blocked unless all of these are manually configured:

```env
RUNTIME_PROFILE=LIVE
DRY_RUN=false
BINANCE_USE_TESTNET=false
BINANCE_FUTURES_REST_URL=https://fapi.binance.com
BINANCE_FUTURES_USER_STREAM_BASE_URL=wss://fstream.binance.com/private
BINANCE_FUTURES_MARKET_WS_BASE_URL=wss://fstream.binance.com
BINANCE_FUTURES_WS_API_URL=wss://ws-fapi.binance.com/ws-fapi/v1
LIVE_TRADING_CONFIRMATION=I_UNDERSTAND_THIS_TRADES_REAL_MONEY
BINANCE_API_KEY=<production-key>
BINANCE_API_SECRET=<production-secret>
KILL_SWITCH=false
```

Keep `ALLOW_MARKET_ORDERS=false`, `MAX_LEVERAGE=1`, and tiny notional caps. This trades real money.

Before any live order path can submit, refresh the live survivability snapshot outside the execution path. The runtime rejects orders locally if exchange filters or position risk are missing, stale, or degraded.

```ts
await runtime.refreshLiveExecutionSurvivabilitySnapshot(["BTCUSDT"], ["operator_preflight_snapshot"]);
```

Expected proof: audit contains `live_execution_survivability_snapshot_refreshed` with status `LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_READY`, and no `exchangeInfo` or `positionRisk` reads occur inside `submitOrder`.

## Phase 0: Mainnet Key Safety

Create a restricted Binance API key before any mainnet readiness check:

1. Use a sub-account if available.
2. Disable withdrawals.
3. Enable Futures permissions only if required for USD-M Futures account reads.
4. Use IP restriction if available.
5. Do not paste keys into chat, tickets, docs, or commit messages.
6. Store production keys in `.env.local` only.
7. Do not commit `.env.local`.
8. Keep `KILL_SWITCH=true` for readiness and no-order smoke.

Run the local safety check before using real keys:

```powershell
pnpm check:env-safety
```

Expected proof: `ENV_SAFETY_OK`, `.env.local` is ignored by git, and no tracked file contains real key assignments.

## Phase 1: Mainnet Read-Only Readiness

This uses real mainnet keys for signed read-only endpoints only. It requires `KILL_SWITCH=true` and does not call `POST /fapi/v1/order`.

```powershell
$env:RUNTIME_PROFILE="LIVE"
$env:DRY_RUN="false"
$env:BINANCE_USE_TESTNET="false"
$env:BINANCE_FUTURES_REST_URL="https://fapi.binance.com"
$env:BINANCE_FUTURES_USER_STREAM_BASE_URL="wss://fstream.binance.com/private"
$env:BINANCE_FUTURES_MARKET_WS_BASE_URL="wss://fstream.binance.com"
$env:BINANCE_FUTURES_WS_API_URL="wss://ws-fapi.binance.com/ws-fapi/v1"
$env:BINANCE_SYMBOLS="BTCUSDT"
$env:BINANCE_API_KEY="<mainnet-key-from-env-local>"
$env:BINANCE_API_SECRET="<mainnet-secret-from-env-local>"
$env:LIVE_TRADING_CONFIRMATION="I_UNDERSTAND_THIS_TRADES_REAL_MONEY"
$env:KILL_SWITCH="true"
$env:ALLOW_MARKET_ORDERS="false"
$env:MAX_ORDER_NOTIONAL_USD="10"
$env:MAX_EXPOSURE_USD="25"
$env:MAX_DAILY_LOSS_USD="10"
$env:MAX_LEVERAGE="1"
pnpm readiness:mainnet
```

Expected proof: `MAINNET_READINESS_OK`, `orderPlaced: false`, endpoint mapping is production-only, open orders are counted, and BTCUSDT position risk is read.

## Phase 2: Mainnet No-Order Smoke

This confirms the live order path remains blocked by the kill switch. It reads mainnet account state, internally submits one synthetic `ORDER_SUBMITTED`, and fails if `newOrder` is called.

```powershell
pnpm smoke:mainnet:no-order
```

Expected proof:

```json
{
  "result": "MAINNET_NO_ORDER_SMOKE_OK",
  "restOrderSent": false,
  "blockedReason": "KILL_SWITCH"
}
```

## Phase 3: Only After This, Consider Tiny Live Limit Order

No mainnet order script exists yet. Do not add one until Phase 0, Phase 1, and Phase 2 have passed with real mainnet credentials and an operator has reviewed open orders, position risk, account balance, endpoint mapping, and kill switch behavior.

Valid testnet config:

```env
BINANCE_USE_TESTNET=true
BINANCE_FUTURES_REST_URL=https://demo-fapi.binance.com
BINANCE_FUTURES_USER_STREAM_BASE_URL=wss://stream.binancefuture.com
BINANCE_FUTURES_MARKET_WS_BASE_URL=wss://stream.binancefuture.com
BINANCE_FUTURES_WS_API_URL=wss://testnet.binancefuture.com/ws-fapi/v1
```

Valid production config:

```env
BINANCE_USE_TESTNET=false
BINANCE_FUTURES_REST_URL=https://fapi.binance.com
BINANCE_FUTURES_USER_STREAM_BASE_URL=wss://fstream.binance.com/private
BINANCE_FUTURES_MARKET_WS_BASE_URL=wss://fstream.binance.com
BINANCE_FUTURES_WS_API_URL=wss://ws-fapi.binance.com/ws-fapi/v1
```

## G. Kill Switch Procedure

```powershell
$env:KILL_SWITCH="true"
```

Then stop the process. Any subsequent submitted order is rejected locally with `kill_switch_enabled`; no Binance order REST call is sent.

Rollback:

1. Set `KILL_SWITCH=true`.
2. Stop the runtime.
3. Cancel open orders on Binance manually or with a separate audited operator command.
4. Reconcile `positionRisk`, balance, and open orders.
5. Restart in `RUNTIME_PROFILE=PAPER` and `DRY_RUN=true`.

## H. Logs Proving No Order Was Sent

Paper runtime proof:

```text
runtime.start() profile=PAPER dryRun=true killSwitch=false
```

Paper smoke proof:

```json
{
  "result": "PAPER_SMOKE_OK",
  "restOrderSent": false
}
```

Gate rejection proof for live attempts:

```text
ORDER_REJECTED reason=dry_run_enabled
ORDER_REJECTED reason=kill_switch_enabled
ORDER_REJECTED reason=DAILY_LOSS_STATE_UNAVAILABLE
ORDER_REJECTED reason=exchange_snapshot_missing
ORDER_REJECTED reason=survivability_snapshot_stale
ORDER_REJECTED reason=survivability_snapshot_degraded
```

## I. Logs Proving A Testnet Order Was Sent

Only the optional tiny-order script should produce this:

```json
{
  "result": "TESTNET_TINY_LIMIT_SENT",
  "orderPlaced": true,
  "testnetOnly": true,
  "postOnly": "GTX"
}
```

Never hardcode credentials, never commit `.env`, never raise leverage from this runtime, and never use production credentials for the testnet scripts.
