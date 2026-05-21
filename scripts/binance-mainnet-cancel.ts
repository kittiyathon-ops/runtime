import { loadConfig } from "../src/infra/config.js";
import { BinanceRest, BinanceRestError } from "../src/adapters/binance/binance-rest.js";
import {
  MainnetTinyRefusal,
  executeMainnetCancel,
  mainnetCancelRefusalPayload,
  mainnetExchangeErrorPayload
} from "../src/live-execution/mainnet-tiny-order.js";

interface CancelArgs {
  symbol?: string;
  orderId?: string;
}

const args = parseArgs(process.argv.slice(2));
const config = loadConfig(process.env);
const rest = new BinanceRest({
  baseUrl: config.binanceFuturesRestUrl,
  apiKey: config.binanceApiKey,
  apiSecret: config.binanceApiSecret,
  useTestnet: false
});

try {
  const accepted = await executeMainnetCancel({
    config,
    env: process.env,
    rest,
    symbol: args.symbol?.toUpperCase(),
    orderId: args.orderId
  });
  console.log(JSON.stringify({
    result: accepted.result,
    orderCanceled: true,
    cancelCalled: true,
    mainnetOnly: true,
    endpoint: rest.baseUrl(),
    request: { symbol: args.symbol?.toUpperCase(), orderId: args.orderId },
    exchangeResponse: accepted.exchangeResponse,
    rateLimits: rest.rateLimitSnapshot()
  }, null, 2));
} catch (error) {
  if (error instanceof MainnetTinyRefusal) {
    console.error(JSON.stringify(mainnetCancelRefusalPayload(error.reason), null, 2));
    process.exit(1);
  }
  if (error instanceof BinanceRestError) {
    console.error(JSON.stringify({
      ...mainnetExchangeErrorPayload(error, "MAINNET_CANCEL_EXCHANGE_REJECTED"),
      orderCanceled: false,
      cancelCalled: false,
      mainnetOnly: true,
      endpoint: rest.baseUrl(),
      request: { symbol: args.symbol?.toUpperCase(), orderId: args.orderId },
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
    if (value === "--") continue;
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
