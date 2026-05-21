import { loadConfig } from "../src/infra/config.js";
import { validateBinanceEndpointMode } from "../src/infra/config.js";
import {
  BinanceRest,
  type BinanceExchangeSymbol
} from "../src/adapters/binance/binance-rest.js";

const LIVE_CONFIRMATION = "I_UNDERSTAND_THIS_TRADES_REAL_MONEY";

function fail(message: string): never {
  console.error(`TESTNET_READINESS_FAILED: ${message}`);
  process.exit(1);
}

const config = loadConfig(process.env);
const baseUrl = config.binanceFuturesRestUrl;

if (!config.binanceUseTestnet) fail("BINANCE_USE_TESTNET must be true");
if (config.runtimeProfile !== "LIVE") fail("RUNTIME_PROFILE must be LIVE");
if (config.dryRun) fail("DRY_RUN must be false");
if (config.liveTradingConfirmation !== LIVE_CONFIRMATION) fail("LIVE_TRADING_CONFIRMATION is missing");
if (config.binanceApiKey.length === 0 || config.binanceApiSecret.length === 0) fail("BINANCE_API_KEY and BINANCE_API_SECRET are required");
if (config.killSwitch) fail("KILL_SWITCH must be false");
const endpointIssues = validateBinanceEndpointMode(config);
if (endpointIssues.length > 0) fail(endpointIssues.map((issue) => issue.message).join("; "));

const rest = new BinanceRest({
  baseUrl,
  apiKey: config.binanceApiKey,
  apiSecret: config.binanceApiSecret,
  useTestnet: true
});

const exchangeInfo = await rest.exchangeInfo();
const balances = await rest.accountBalance();
const allowlist = new Set(config.binanceSymbols.map((symbol) => symbol.toUpperCase()));
const btcusdt = exchangeInfo.symbols.find((symbol) => symbol.symbol === "BTCUSDT");

if (!allowlist.has("BTCUSDT")) fail("BINANCE_SYMBOLS must include BTCUSDT");
if (btcusdt === undefined) fail("BTCUSDT missing from exchangeInfo");
if (btcusdt.status !== "TRADING") fail(`BTCUSDT status is ${btcusdt.status}`);

const filterResult = validateBtcusdtFilters(btcusdt);
if (!filterResult.ok) fail(filterResult.reason);

console.log(JSON.stringify({
  result: "TESTNET_READINESS_OK",
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
  binanceUseTestnet: config.binanceUseTestnet,
  symbols: config.binanceSymbols,
  btcusdtFilters: filterResult.filters,
  balancesRead: balances.length,
  rateLimits: rest.rateLimitSnapshot(),
  orderPlaced: false
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
