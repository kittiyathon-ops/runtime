import { loadConfig, validateBinanceEndpointMode } from "../src/infra/config.js";
import { BinanceRest, type BinanceExchangeSymbol } from "../src/adapters/binance/binance-rest.js";

const LIVE_CONFIRMATION = "I_UNDERSTAND_THIS_TRADES_REAL_MONEY";
const SYMBOL = "BTCUSDT";

function fail(message: string): never {
  console.error(`MAINNET_READINESS_FAILED: ${message}`);
  process.exit(1);
}

const config = loadConfig(process.env);

if (config.runtimeProfile !== "LIVE") fail("RUNTIME_PROFILE must be LIVE");
if (config.dryRun) fail("DRY_RUN must be false");
if (config.binanceUseTestnet) fail("BINANCE_USE_TESTNET must be false");
if (config.liveTradingConfirmation !== LIVE_CONFIRMATION) fail("LIVE_TRADING_CONFIRMATION is missing");
if (config.binanceApiKey.length === 0 || config.binanceApiSecret.length === 0) fail("BINANCE_API_KEY and BINANCE_API_SECRET are required");
if (!config.killSwitch) fail("KILL_SWITCH must be true for mainnet readiness");
if (!config.binanceSymbols.includes(SYMBOL)) fail(`BINANCE_SYMBOLS must include ${SYMBOL}`);

const endpointIssues = validateBinanceEndpointMode(config);
if (endpointIssues.length > 0) fail(endpointIssues.map((issue) => issue.message).join("; "));

const rest = new BinanceRest({
  baseUrl: config.binanceFuturesRestUrl,
  apiKey: config.binanceApiKey,
  apiSecret: config.binanceApiSecret,
  useTestnet: false
});

let accountReachable = false;
const exchangeInfo = await rest.exchangeInfo();
const balances = await rest.accountBalance();
accountReachable = true;
const openOrders = await rest.openOrders(SYMBOL);
const positions = await rest.positionRisk(SYMBOL);
const btcusdt = exchangeInfo.symbols.find((symbol) => symbol.symbol === SYMBOL);
const filters = btcusdt === undefined ? undefined : validateBtcusdtFilters(btcusdt);
const position = positions.find((candidate) => candidate.symbol === SYMBOL);

console.log(JSON.stringify({
  result: "MAINNET_READINESS_OK",
  accountReachable,
  symbolFiltersFound: filters?.ok === true,
  currentOpenOrdersCount: openOrders.length,
  currentBtcusdtPositionAmount: position?.positionAmt ?? "0",
  endpoints: {
    rest: rest.baseUrl(),
    userStreamBase: config.binanceFuturesUserStreamBaseUrl,
    userStreamListenKeyPattern: `${config.binanceFuturesUserStreamBaseUrl.replace(/\/+$/, "")}/ws/<listenKey>`,
    marketWsBase: config.binanceFuturesMarketWsBaseUrl,
    wsApi: config.binanceFuturesWsApiUrl,
    wsApiUsed: false
  },
  runtimeProfile: config.runtimeProfile,
  dryRun: config.dryRun,
  killSwitch: config.killSwitch,
  binanceUseTestnet: config.binanceUseTestnet,
  balancesRead: balances.length,
  btcusdtFilters: filters?.ok === true ? filters.filters : undefined,
  rateLimits: rest.rateLimitSnapshot(),
  orderPlaced: false,
  newOrderCalled: false
}, null, 2));

function validateBtcusdtFilters(symbol: BinanceExchangeSymbol): { ok: true; filters: Record<string, string> } | { ok: false; reason: string } {
  const filters = new Map(symbol.filters.map((filter) => [filter.filterType, filter]));
  const priceFilter = filters.get("PRICE_FILTER");
  const lotSize = filters.get("LOT_SIZE");
  const minNotional = filters.get("MIN_NOTIONAL") ?? filters.get("NOTIONAL");
  if (priceFilter?.tickSize === undefined) return { ok: false, reason: "BTCUSDT PRICE_FILTER tickSize missing" };
  if (lotSize?.stepSize === undefined || lotSize.minQty === undefined || lotSize.maxQty === undefined) {
    return { ok: false, reason: "BTCUSDT LOT_SIZE stepSize/minQty/maxQty missing" };
  }
  if (minNotional?.minNotional === undefined && minNotional?.notional === undefined) {
    return { ok: false, reason: "BTCUSDT MIN_NOTIONAL/NOTIONAL missing" };
  }
  return {
    ok: true,
    filters: {
      tickSize: priceFilter.tickSize,
      stepSize: lotSize.stepSize,
      minQty: lotSize.minQty,
      maxQty: lotSize.maxQty,
      minNotional: minNotional.minNotional ?? minNotional.notional ?? ""
    }
  };
}
