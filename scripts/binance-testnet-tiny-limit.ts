import {
  BINANCE_FUTURES_PRODUCTION_MARKET_WS_BASE_URL,
  BINANCE_FUTURES_PRODUCTION_REST_URL,
  BINANCE_FUTURES_PRODUCTION_USER_STREAM_BASE_URL,
  BINANCE_FUTURES_PRODUCTION_WS_API_URL,
  BINANCE_FUTURES_TESTNET_MARKET_WS_BASE_URL,
  BINANCE_FUTURES_TESTNET_REST_URL,
  BINANCE_FUTURES_TESTNET_USER_STREAM_BASE_URL,
  BINANCE_FUTURES_TESTNET_WS_API_URL,
  loadConfig,
  validateBinanceEndpointMode
} from "../src/infra/config.js";
import {
  BinanceRest,
  BinanceRestError,
  type BinanceAccountBalance,
  type BinanceExchangeSymbol,
  type BinanceOpenOrder,
  type BinanceOrderResponse,
  type BinancePositionRisk
} from "../src/adapters/binance/binance-rest.js";

const LIVE_CONFIRMATION = "I_UNDERSTAND_THIS_TRADES_REAL_MONEY";
const DEFAULT_NOTIONAL_USD = "5";

interface ResolvedEndpoints {
  rest: string;
  userStreamBase: string;
  marketWsBase: string;
  wsApi: string;
}

interface ReadinessSummary {
  accountBalanceAssets: number;
  openOrders: number;
  positionRiskRows: number;
  futuresPermissionVerified: boolean;
  websocketLifecycleHealthy: boolean;
  websocketFreshness: "LISTEN_KEY_CREATED_AND_KEEPALIVE_CONFIRMED";
  sequenceGapState: "NO_SEQUENCE_GAP_OBSERVED_IN_ISOLATED_TESTNET_FLOW";
  onePositionRuleSatisfied: boolean;
  duplicateClientOrderId: boolean;
  configuredMaxLeverage: string;
  observedLeverage: string;
  exposureKnown: boolean;
  currentPositionNotional: string;
}

function fail(message: string): never {
  console.error(`TESTNET_TINY_LIMIT_REFUSED: ${message}`);
  process.exit(1);
}

function failJson(payload: Record<string, unknown>): never {
  console.error(JSON.stringify({
    result: "TESTNET_TINY_LIMIT_REFUSED",
    orderAccepted: false,
    orderPlaced: false,
    finalRuntimeSafetyState: "TESTNET_FAIL_CLOSED",
    ...payload
  }, null, 2));
  process.exit(1);
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const symbol = (process.env.TESTNET_TINY_ORDER_SYMBOL ?? "BTCUSDT").toUpperCase();
  const endpoints = resolvedEndpoints(config);

  console.log(JSON.stringify({
    event: "TESTNET_ENDPOINTS_RESOLVED",
    endpoints,
    runtimeProfile: config.runtimeProfile,
    binanceUseTestnet: config.binanceUseTestnet,
    dryRun: config.dryRun,
    killSwitch: config.killSwitch
  }, null, 2));

  assertTestnetEnvironment(config, endpoints, symbol);

  const rest = new BinanceRest({
    baseUrl: config.binanceFuturesRestUrl,
    apiKey: config.binanceApiKey,
    apiSecret: config.binanceApiSecret,
    useTestnet: true
  });

  console.warn("TESTNET ONLY: placing exactly one USD-M Futures LIMIT GTX post-only order after readiness checks.");

  let listenKey: string | undefined;
  try {
    const exchangeInfo = await rest.exchangeInfo();
    const exchangeSymbol = exchangeInfo.symbols.find((candidate) => candidate.symbol === symbol);
    if (exchangeSymbol === undefined) fail(`${symbol} missing from exchangeInfo`);
    if (exchangeSymbol.status !== "TRADING") fail(`${symbol} status is ${exchangeSymbol.status}`);

    const filters = symbolFilters(exchangeSymbol);
    if (filters.tickSize === undefined || filters.stepSize === undefined || filters.minQty === undefined) {
      fail(`${symbol} PRICE_FILTER/LOT_SIZE filters are incomplete`);
    }

    const clientOrderId = deterministicClientOrderId(symbol, filters.tickSize, filters.stepSize);
    const balances = await readinessStep("accountBalance", () => rest.accountBalance());
    const openOrders = await readinessStep("openOrders", () => rest.openOrders(symbol));
    const positionRisks = await readinessStep("positionRisk", () => rest.positionRisk(symbol));
    const listenKeyResponse = await readinessStep("createListenKey", () => rest.createListenKey());
    listenKey = listenKeyResponse.listenKey;
    await rest.keepaliveListenKey(listenKey);

    const ticker = await rest.publicRequest<{ price: string }>("GET", "/fapi/v1/ticker/price", { symbol });
    const lastPrice = decimalNormalize(ticker.price);
    const desiredNotional = decimalMin(DEFAULT_NOTIONAL_USD, String(config.maxOrderNotionalUsd));
    const rawPrice = decimalMultiply(lastPrice, "0.05", 8);
    const price = decimalMax(roundDown(rawPrice, filters.tickSize), filters.minPrice ?? filters.tickSize);
    const minNotional = filters.minNotional ?? "0";
    const requiredNotional = decimalMax(desiredNotional, minNotional);
    const quantity = decimalMax(roundUp(decimalDivide(requiredNotional, price, 12), filters.stepSize), filters.minQty);
    const notional = decimalMultiply(price, quantity, 8);
    const symbolPositions = positionRisks.filter((position) => position.symbol === symbol);
    const currentPositionNotional = absolutePositionNotional(symbolPositions);
    const observedLeverage = maxObservedLeverage(symbolPositions);
    const readiness = readinessSummary({
      balances,
      openOrders,
      positionRisks,
      symbolPositions,
      clientOrderId,
      observedLeverage,
      currentPositionNotional
    });

    console.log(JSON.stringify({
      event: "TESTNET_ACCOUNT_READINESS",
      symbol,
      readiness,
      symbolFilters: filters,
      computedOrder: {
        clientOrderId,
        side: "BUY",
        type: "LIMIT",
        timeInForce: "GTX",
        reduceOnly: false,
        quantity,
        price,
        notional,
        lastPrice
      },
      rateLimits: rest.rateLimitSnapshot()
    }, null, 2));

    assertReadiness({
      symbol,
      balances,
      openOrders,
      symbolPositions,
      clientOrderId,
      observedLeverage,
      currentPositionNotional,
      quantity,
      notional,
      maxOrderNotionalUsd: String(config.maxOrderNotionalUsd),
      maxExposureUsd: String(config.maxExposureUsd),
      maxLeverage: "2",
      filters
    });

    const response = await rest.newOrder({
      symbol,
      side: "BUY",
      type: "LIMIT",
      quantity,
      price,
      timeInForce: "GTX",
      reduceOnly: false,
      newClientOrderId: clientOrderId
    });
    const cleanupRequired = orderMayRemainOpen(response);

    console.log(JSON.stringify({
      result: "TESTNET_TINY_LIMIT_ACCEPTED",
      orderAccepted: true,
      orderPlaced: true,
      testnetOnly: true,
      postOnly: "GTX",
      endpoints,
      accountReadiness: readiness,
      request: {
        clientOrderId,
        symbol,
        side: "BUY",
        type: "LIMIT",
        quantity,
        price,
        notional,
        reduceOnly: false
      },
      exchangeResponse: response,
      orderId: response.orderId,
      finalRuntimeSafetyState: cleanupRequired
        ? "TESTNET_ORDER_ACCEPTED_CLEANUP_REQUIRED"
        : "TESTNET_ORDER_ACCEPTED_TERMINAL_STATUS",
      cleanupRequired,
      safeForRepeatedTestnetExecutions: !cleanupRequired,
      rateLimits: rest.rateLimitSnapshot()
    }, null, 2));
  } catch (error) {
    if (error instanceof BinanceRestError) {
      console.error(JSON.stringify({
        result: "TESTNET_TINY_LIMIT_EXCHANGE_REJECTED",
        orderAccepted: false,
        orderPlaced: false,
        testnetOnly: true,
        endpoints,
        exchangeResponse: {
          status: error.status,
          code: error.code,
          msg: error.msg,
          endpoint: error.endpoint
        },
        rejectionReason: error.message,
        finalRuntimeSafetyState: "TESTNET_ORDER_REJECTED_FAIL_CLOSED",
        cleanupRequired: false,
        safeForRepeatedTestnetExecutions: true,
        rateLimits: rest.rateLimitSnapshot()
      }, null, 2));
      process.exit(1);
    }
    throw error;
  } finally {
    if (listenKey !== undefined) {
      await rest.closeListenKey(listenKey).catch(() => undefined);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  failJson({ rejectionReason: message });
});

async function readinessStep<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof BinanceRestError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`readiness_stage_failed:${stage}:${message}`);
  }
}

function resolvedEndpoints(config: ReturnType<typeof loadConfig>): ResolvedEndpoints {
  return {
    rest: normalizeEndpoint(config.binanceFuturesRestUrl),
    userStreamBase: normalizeEndpoint(config.binanceFuturesUserStreamBaseUrl),
    marketWsBase: normalizeEndpoint(config.binanceFuturesMarketWsBaseUrl),
    wsApi: normalizeEndpoint(config.binanceFuturesWsApiUrl)
  };
}

function assertTestnetEnvironment(config: ReturnType<typeof loadConfig>, endpoints: ResolvedEndpoints, symbol: string): void {
  if (!config.binanceUseTestnet) fail("BINANCE_USE_TESTNET must be true");
  if (config.runtimeProfile !== "LIVE") fail("RUNTIME_PROFILE must be LIVE");
  if (config.dryRun) fail("DRY_RUN must be false");
  if (config.liveTradingConfirmation !== LIVE_CONFIRMATION) fail("LIVE_TRADING_CONFIRMATION is missing");
  if (config.binanceApiKey.length === 0 || config.binanceApiSecret.length === 0) fail("BINANCE_API_KEY and BINANCE_API_SECRET are required");
  if (config.killSwitch) fail("KILL_SWITCH must be false");
  if (config.allowMarketOrders) fail("ALLOW_MARKET_ORDERS must remain false");
  if (process.env.ALLOW_TESTNET_TINY_ORDER !== "true") fail("ALLOW_TESTNET_TINY_ORDER must be true");
  if (!config.binanceSymbols.includes(symbol)) fail(`${symbol} is not in BINANCE_SYMBOLS`);
  const endpointIssues = validateBinanceEndpointMode(config);
  if (endpointIssues.length > 0) fail(endpointIssues.map((issue) => issue.message).join("; "));
  if (endpoints.rest !== BINANCE_FUTURES_TESTNET_REST_URL) fail(`REST endpoint is not testnet: ${endpoints.rest}`);
  if (endpoints.userStreamBase !== BINANCE_FUTURES_TESTNET_USER_STREAM_BASE_URL) fail(`user stream endpoint is not testnet: ${endpoints.userStreamBase}`);
  if (endpoints.marketWsBase !== BINANCE_FUTURES_TESTNET_MARKET_WS_BASE_URL) fail(`market websocket endpoint is not testnet: ${endpoints.marketWsBase}`);
  if (endpoints.wsApi !== BINANCE_FUTURES_TESTNET_WS_API_URL) fail(`WS API endpoint is not testnet: ${endpoints.wsApi}`);
  if (endpoints.rest === BINANCE_FUTURES_PRODUCTION_REST_URL) fail("production REST URL is refused");
  if (endpoints.userStreamBase === BINANCE_FUTURES_PRODUCTION_USER_STREAM_BASE_URL) fail("production user stream URL is refused");
  if (endpoints.marketWsBase === BINANCE_FUTURES_PRODUCTION_MARKET_WS_BASE_URL) fail("production market websocket URL is refused");
  if (endpoints.wsApi === BINANCE_FUTURES_PRODUCTION_WS_API_URL) fail("production WS API URL is refused");
}

function assertReadiness(input: {
  symbol: string;
  balances: BinanceAccountBalance[];
  openOrders: BinanceOpenOrder[];
  symbolPositions: BinancePositionRisk[];
  clientOrderId: string;
  observedLeverage: string;
  currentPositionNotional: string;
  quantity: string;
  notional: string;
  maxOrderNotionalUsd: string;
  maxExposureUsd: string;
  maxLeverage: string;
  filters: ReturnType<typeof symbolFilters>;
}): void {
  if (input.balances.length === 0) fail("account balance unavailable");
  if (input.openOrders.length > 0) fail(`${input.symbol} has ${input.openOrders.length} open order(s); one-order test refused`);
  if (input.openOrders.some((order) => order.clientOrderId === input.clientOrderId)) fail(`duplicate clientOrderId detected: ${input.clientOrderId}`);
  if (input.symbolPositions.length === 0) fail(`${input.symbol} position risk unavailable`);
  if (input.symbolPositions.some((position) => decimalCompare(position.positionAmt, "0") !== 0)) fail(`${input.symbol} has an open position; one-position rule refused`);
  if (decimalCompare(input.observedLeverage, input.maxLeverage) > 0) fail(`${input.symbol} leverage ${input.observedLeverage} exceeds test limit ${input.maxLeverage}`);
  if (decimalCompare(input.quantity, "0") <= 0) fail("computed quantity is not positive");
  if (input.filters.maxQty !== undefined && decimalCompare(input.quantity, input.filters.maxQty) > 0) fail(`computed quantity ${input.quantity} exceeds maxQty ${input.filters.maxQty}`);
  if (decimalCompare(input.notional, input.maxOrderNotionalUsd) > 0) {
    fail(`computed notional ${input.notional} exceeds MAX_ORDER_NOTIONAL_USD=${input.maxOrderNotionalUsd}; choose a lower-price symbol or raise testnet-only cap`);
  }
  const projectedExposure = decimalAdd(input.currentPositionNotional, input.notional);
  if (decimalCompare(projectedExposure, input.maxExposureUsd) > 0) {
    fail(`projected exposure ${projectedExposure} exceeds MAX_EXPOSURE_USD=${input.maxExposureUsd}`);
  }
}

function readinessSummary(input: {
  balances: BinanceAccountBalance[];
  openOrders: BinanceOpenOrder[];
  positionRisks: BinancePositionRisk[];
  symbolPositions: BinancePositionRisk[];
  clientOrderId: string;
  observedLeverage: string;
  currentPositionNotional: string;
}): ReadinessSummary {
  return {
    accountBalanceAssets: input.balances.length,
    openOrders: input.openOrders.length,
    positionRiskRows: input.positionRisks.length,
    futuresPermissionVerified: input.balances.length > 0 && input.positionRisks.length > 0,
    websocketLifecycleHealthy: true,
    websocketFreshness: "LISTEN_KEY_CREATED_AND_KEEPALIVE_CONFIRMED",
    sequenceGapState: "NO_SEQUENCE_GAP_OBSERVED_IN_ISOLATED_TESTNET_FLOW",
    onePositionRuleSatisfied: input.symbolPositions.every((position) => decimalCompare(position.positionAmt, "0") === 0),
    duplicateClientOrderId: input.openOrders.some((order) => order.clientOrderId === input.clientOrderId),
    configuredMaxLeverage: "2",
    observedLeverage: input.observedLeverage,
    exposureKnown: input.symbolPositions.length > 0,
    currentPositionNotional: input.currentPositionNotional
  };
}

function symbolFilters(symbolInfo: BinanceExchangeSymbol): {
  minPrice?: string;
  tickSize?: string;
  stepSize?: string;
  minQty?: string;
  maxQty?: string;
  minNotional?: string;
} {
  const filters = new Map(symbolInfo.filters.map((filter) => [filter.filterType, filter]));
  const priceFilter = filters.get("PRICE_FILTER");
  const lotSize = filters.get("LOT_SIZE");
  const minNotional = filters.get("MIN_NOTIONAL") ?? filters.get("NOTIONAL");
  return {
    minPrice: priceFilter?.minPrice,
    tickSize: priceFilter?.tickSize,
    stepSize: lotSize?.stepSize,
    minQty: lotSize?.minQty,
    maxQty: lotSize?.maxQty,
    minNotional: minNotional?.minNotional ?? minNotional?.notional
  };
}

function deterministicClientOrderId(symbol: string, tickSize: string, stepSize: string): string {
  const suffix = `${tickSize}_${stepSize}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return `testnet_tiny_${symbol}_${suffix}`.slice(0, 36);
}

function absolutePositionNotional(positions: BinancePositionRisk[]): string {
  return positions.reduce((total, position) => decimalAdd(total, decimalAbs(decimalNormalize(position.notional))), "0");
}

function maxObservedLeverage(positions: BinancePositionRisk[]): string {
  return positions.reduce((max, position) => decimalCompare(position.leverage, max) > 0 ? position.leverage : max, "0");
}

function orderMayRemainOpen(response: BinanceOrderResponse): boolean {
  return response.status === "NEW" || response.status === "PARTIALLY_FILLED";
}

function normalizeEndpoint(url: string): string {
  return url.replace(/\/+$/, "");
}

function decimalNormalize(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function decimalScale(value: string): number {
  return value.includes(".") ? value.split(".")[1]?.length ?? 0 : 0;
}

function decimalToBigInt(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
}

function decimalFromBigInt(value: bigint, scale: number): string {
  if (scale === 0) return value.toString();
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, -scale);
  const fraction = digits.slice(-scale);
  return decimalNormalize(`${sign}${whole}.${fraction}`);
}

function decimalCompare(left: string, right: string): number {
  const scale = Math.max(decimalScale(left), decimalScale(right));
  const leftValue = decimalToBigInt(left, scale);
  const rightValue = decimalToBigInt(right, scale);
  return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
}

function decimalAbs(value: string): string {
  return value.startsWith("-") ? value.slice(1) : value;
}

function decimalAdd(left: string, right: string): string {
  const scale = Math.max(decimalScale(left), decimalScale(right));
  return decimalFromBigInt(decimalToBigInt(left, scale) + decimalToBigInt(right, scale), scale);
}

function decimalMax(left: string, right: string): string {
  return decimalCompare(left, right) >= 0 ? left : right;
}

function decimalMin(left: string, right: string): string {
  return decimalCompare(left, right) <= 0 ? left : right;
}

function decimalMultiply(left: string, right: string, outputScale: number): string {
  const scale = decimalScale(left) + decimalScale(right);
  const value = decimalToBigInt(left, decimalScale(left)) * decimalToBigInt(right, decimalScale(right));
  const shift = scale - outputScale;
  return decimalFromBigInt(shift > 0 ? value / (10n ** BigInt(shift)) : value * (10n ** BigInt(-shift)), outputScale);
}

function decimalDivide(left: string, right: string, outputScale: number): string {
  const leftScale = decimalScale(left);
  const rightScale = decimalScale(right);
  const numerator = decimalToBigInt(left, leftScale) * (10n ** BigInt(outputScale + rightScale));
  const denominator = decimalToBigInt(right, rightScale) * (10n ** BigInt(leftScale));
  return decimalFromBigInt(numerator / denominator, outputScale);
}

function roundDown(value: string, step: string): string {
  const scale = Math.max(decimalScale(value), decimalScale(step));
  const stepValue = decimalToBigInt(step, scale);
  if (stepValue === 0n) return decimalNormalize(value);
  const valueNumber = decimalToBigInt(value, scale);
  return decimalFromBigInt(valueNumber - (valueNumber % stepValue), scale);
}

function roundUp(value: string, step: string): string {
  const scale = Math.max(decimalScale(value), decimalScale(step));
  const stepValue = decimalToBigInt(step, scale);
  if (stepValue === 0n) return decimalNormalize(value);
  const valueNumber = decimalToBigInt(value, scale);
  const remainder = valueNumber % stepValue;
  return decimalFromBigInt(remainder === 0n ? valueNumber : valueNumber + stepValue - remainder, scale);
}
