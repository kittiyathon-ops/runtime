import type { RuntimeEvent } from "../src/core/event.js";
import { RuntimeEventSchema } from "../src/core/event.js";
import { loadConfig, validateBinanceEndpointMode } from "../src/infra/config.js";
import {
  BinanceRest,
  type BinanceOrderRequest,
  type BinanceOrderResponse
} from "../src/adapters/binance/binance-rest.js";
import { BinanceLiveExecution } from "../src/live-execution/binance-live-execution.js";

const LIVE_CONFIRMATION = "I_UNDERSTAND_THIS_TRADES_REAL_MONEY";
const SYMBOL = "BTCUSDT";

function fail(message: string): never {
  console.error(`MAINNET_NO_ORDER_SMOKE_FAILED: ${message}`);
  process.exit(1);
}

class NoOrderRest extends BinanceRest {
  newOrderCalls = 0;

  override async newOrder(_order: BinanceOrderRequest): Promise<BinanceOrderResponse> {
    this.newOrderCalls += 1;
    throw new Error("newOrder_must_not_be_called_in_mainnet_no_order_smoke");
  }
}

const config = loadConfig(process.env);

if (config.runtimeProfile !== "LIVE") fail("RUNTIME_PROFILE must be LIVE");
if (config.dryRun) fail("DRY_RUN must be false");
if (config.binanceUseTestnet) fail("BINANCE_USE_TESTNET must be false");
if (config.liveTradingConfirmation !== LIVE_CONFIRMATION) fail("LIVE_TRADING_CONFIRMATION is missing");
if (config.binanceApiKey.length === 0 || config.binanceApiSecret.length === 0) fail("BINANCE_API_KEY and BINANCE_API_SECRET are required");
if (!config.killSwitch) fail("KILL_SWITCH must be true");
if (config.allowMarketOrders) fail("ALLOW_MARKET_ORDERS must be false");
if (!config.binanceSymbols.includes(SYMBOL)) fail(`BINANCE_SYMBOLS must include ${SYMBOL}`);

const endpointIssues = validateBinanceEndpointMode(config);
if (endpointIssues.length > 0) fail(endpointIssues.map((issue) => issue.message).join("; "));

const rest = new NoOrderRest({
  baseUrl: config.binanceFuturesRestUrl,
  apiKey: config.binanceApiKey,
  apiSecret: config.binanceApiSecret,
  useTestnet: false
});

await rest.exchangeInfo();
await rest.accountBalance();
await rest.positionRisk(SYMBOL);

const emitted: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
const liveExecution = new BinanceLiveExecution(
  (event) => {
    emitted.push({ eventType: event.eventType, payload: event.payload });
  },
  () => undefined,
  { config, rest, nowMs: () => 1_700_000_000_000 }
);

const syntheticOrder: RuntimeEvent = RuntimeEventSchema.parse({
  seq: 1,
  timestamp: 1_700_000_000_000,
  receiveTimestamp: 1_700_000_000_000,
  processingTimestamp: 1_700_000_000_000,
  source: "execution",
  symbol: SYMBOL,
  eventType: "ORDER_SUBMITTED",
  correlationId: "mainnet_no_order_smoke",
  causationId: "mainnet_no_order_smoke_intent",
  payload: {
    side: "BUY",
    type: "LIMIT",
    quantity: "0.001",
    limitPrice: "1000.0",
    idempotencyKey: "mainnet_no_order_smoke_1",
    status: "SUBMITTED",
    liveExecution: true
  }
});

await liveExecution.submitOrder(syntheticOrder);

const rejection = emitted.find((event) => event.eventType === "ORDER_REJECTED");
const blockedReason = rejection?.payload.reason === "kill_switch_enabled" ? "KILL_SWITCH" : String(rejection?.payload.reason ?? "UNKNOWN");
if (rest.newOrderCalls !== 0) fail("newOrder was called");
if (blockedReason !== "KILL_SWITCH") fail(`expected KILL_SWITCH block, got ${blockedReason}`);

console.log(JSON.stringify({
  result: "MAINNET_NO_ORDER_SMOKE_OK",
  restOrderSent: false,
  blockedReason,
  readOnlyEndpointsChecked: true,
  endpoints: {
    rest: rest.baseUrl(),
    userStreamBase: config.binanceFuturesUserStreamBaseUrl,
    marketWsBase: config.binanceFuturesMarketWsBaseUrl,
    wsApi: config.binanceFuturesWsApiUrl,
    wsApiUsed: false
  }
}, null, 2));
