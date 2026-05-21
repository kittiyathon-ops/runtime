import {
  BINANCE_FUTURES_TESTNET_REST_URL,
  loadConfig,
  validateBinanceEndpointMode
} from "../src/infra/config.js";
import { BinanceRest, BinanceRestError } from "../src/adapters/binance/binance-rest.js";

interface CancelArgs {
  symbol?: string;
  orderId?: string;
}

function fail(message: string): never {
  console.error(JSON.stringify({
    result: "TESTNET_CANCEL_REFUSED",
    orderCanceled: false,
    reason: message
  }, null, 2));
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const symbol = args.symbol?.toUpperCase();
const orderId = args.orderId;
const config = loadConfig(process.env);
const restEndpoint = normalizeEndpoint(config.binanceFuturesRestUrl);

if (symbol === undefined || symbol.length === 0) fail("symbol_required");
if (orderId === undefined || !/^\d+$/.test(orderId)) fail("numeric_orderId_required");
if (!config.binanceUseTestnet) fail("BINANCE_USE_TESTNET_must_be_true");
if (restEndpoint !== BINANCE_FUTURES_TESTNET_REST_URL) fail(`testnet_rest_endpoint_required:got_${restEndpoint}`);
if (config.binanceApiKey.length === 0 || config.binanceApiSecret.length === 0) fail("BINANCE_API_KEY_and_BINANCE_API_SECRET_required");

const endpointIssues = validateBinanceEndpointMode(config);
if (endpointIssues.length > 0) fail(endpointIssues.map((issue) => issue.message).join("; "));

const rest = new BinanceRest({
  baseUrl: config.binanceFuturesRestUrl,
  apiKey: config.binanceApiKey,
  apiSecret: config.binanceApiSecret,
  useTestnet: true
});

try {
  const response = await rest.cancelOrder(symbol, orderId);
  console.log(JSON.stringify({
    result: "TESTNET_CANCEL_SENT",
    orderCanceled: true,
    testnetOnly: true,
    endpoint: rest.baseUrl(),
    request: { symbol, orderId },
    exchangeResponse: response,
    rateLimits: rest.rateLimitSnapshot()
  }, null, 2));
} catch (error) {
  if (error instanceof BinanceRestError) {
    console.error(JSON.stringify({
      result: "TESTNET_CANCEL_EXCHANGE_REJECTED",
      orderCanceled: false,
      testnetOnly: true,
      endpoint: rest.baseUrl(),
      request: { symbol, orderId },
      exchangeResponse: {
        status: error.status,
        code: error.code,
        msg: error.msg,
        endpoint: error.endpoint
      },
      reason: error.message,
      rateLimits: rest.rateLimitSnapshot()
    }, null, 2));
    process.exit(1);
  }
  throw error;
}

function parseArgs(rawArgs: string[]): CancelArgs {
  const parsed: CancelArgs = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const value = rawArgs[index];
    if (value === "--symbol") {
      parsed.symbol = rawArgs[index + 1];
      index += 1;
      continue;
    }
    if (value.startsWith("--symbol=")) {
      parsed.symbol = value.slice("--symbol=".length);
      continue;
    }
    if (value === "--orderId") {
      parsed.orderId = rawArgs[index + 1];
      index += 1;
      continue;
    }
    if (value.startsWith("--orderId=")) {
      parsed.orderId = value.slice("--orderId=".length);
    }
  }
  return parsed;
}

function normalizeEndpoint(url: string): string {
  return url.replace(/\/+$/, "");
}
