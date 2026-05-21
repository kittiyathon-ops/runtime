import {
  BINANCE_FUTURES_PRODUCTION_MARKET_WS_BASE_URL,
  BINANCE_FUTURES_PRODUCTION_REST_URL,
  BINANCE_FUTURES_PRODUCTION_USER_STREAM_BASE_URL,
  BINANCE_FUTURES_PRODUCTION_WS_API_URL,
  type RuntimeConfig,
  validateBinanceEndpointMode
} from "../infra/config.js";
import {
  BinanceRestError,
  type BinanceAccountBalance,
  type BinanceExchangeInfo,
  type BinanceExchangeSymbol,
  type BinanceOpenOrder,
  type BinanceOrderResponse,
  type BinancePositionRisk
} from "../adapters/binance/binance-rest.js";

export const LIVE_TRADING_CONFIRMATION = "I_UNDERSTAND_THIS_TRADES_REAL_MONEY";
export const MAINNET_TINY_ORDER_CONFIRMATION = "I_ACCEPT_ONE_TINY_REAL_MONEY_LIMIT_ORDER";
export const MAINNET_CANCEL_CONFIRMATION = "I_ACCEPT_CANCEL_REAL_MONEY_ORDER";
export const DEFAULT_MAINNET_TINY_SYMBOL = "ETHUSDT";
export const MAINNET_TINY_ALLOWED_SYMBOLS = ["ETHUSDT", "BTCUSDT"] as const;
export type MainnetTinySymbol = typeof MAINNET_TINY_ALLOWED_SYMBOLS[number];

export interface MainnetTinyEnv {
  ALLOW_MAINNET_TINY_ORDER?: string | undefined;
  MAINNET_TINY_ORDER_CONFIRMATION?: string | undefined;
  MAINNET_TINY_ORDER_RUN_ID?: string | undefined;
  MAINNET_CANCEL_CONFIRMATION?: string | undefined;
  MAINNET_DAILY_LOSS_USD?: string | undefined;
  MAINNET_SURVIVABILITY_SNAPSHOT_READY?: string | undefined;
  MAINNET_SURVIVABILITY_SNAPSHOT_DEGRADED?: string | undefined;
  MAX_ORDER_NOTIONAL_USD?: string | undefined;
  MAX_EXPOSURE_USD?: string | undefined;
  MAINNET_DAILY_LOSS_STATE_FRESH?: string | undefined;
  MAINNET_EXPECTED_POSITION_MODE?: string | undefined;
  MAINNET_MAX_CLOCK_OFFSET_MS?: string | undefined;
  MAINNET_TINY_SYMBOL?: string | undefined;
}

export interface MainnetTinyRest {
  baseUrl(): string;
  rateLimitSnapshot(): unknown;
  exchangeInfo(): Promise<BinanceExchangeInfo>;
  accountBalance(): Promise<BinanceAccountBalance[]>;
  openOrders(symbol?: string): Promise<BinanceOpenOrder[]>;
  positionRisk(symbol?: string): Promise<BinancePositionRisk[]>;
  publicRequest<T>(method: "GET", endpoint: string, params?: Record<string, string>): Promise<T>;
  newOrder(order: {
    symbol: string;
    side: "BUY";
    type: "LIMIT";
    quantity: string;
    price: string;
    timeInForce: "GTX";
    reduceOnly: false;
    newClientOrderId: string;
  }): Promise<BinanceOrderResponse>;
  cancelOrder(symbol: string, orderId: number | string): Promise<BinanceOrderResponse>;
  serverTime(): Promise<{ serverTime: number }>;
  signedRequest<T>(method: "GET", endpoint: string, params?: Record<string, string>): Promise<T>;
}

export interface MainnetTinyOrderPlan {
  clientOrderId: string;
  symbol: MainnetTinySymbol;
  side: "BUY";
  type: "LIMIT";
  timeInForce: "GTX";
  reduceOnly: false;
  quantity: string;
  price: string;
  notional: string;
  priceSource: {
    source: "bookTicker.bidPrice";
    bidPrice: string;
    askPrice: string;
    markPrice: string;
    spread: string;
    safeOffset: "0.999";
  };
  filters: SymbolFilters;
}

export interface MainnetTinyReadiness {
  accountBalanceAssets: number;
  openOrdersCount: number;
  positionAmount: string;
  leverage: string;
  exposureKnown: boolean;
  currentPositionNotional: string;
  dailyLossUsd: string;
  survivabilitySnapshotReady: boolean;
  survivabilitySnapshotDegraded: boolean;
  clockOffsetMs: number;
  positionMode: "ONE_WAY" | "HEDGE";
  postOrderReconciled: boolean;
  persistenceCheckpointIntegrated: false;
}

export interface MainnetTinyAccepted {
  result: "MAINNET_TINY_LIMIT_ACCEPTED";
  orderAccepted: true;
  newOrderCalled: true;
  orderId: number;
  cleanupRequired: boolean;
  safeForRepeatedMainnetExecutions: boolean;
  cancelCommand?: string;
  exchangeResponse: BinanceOrderResponse;
  reconciliationOpenOrderFound: boolean;
  plan: MainnetTinyOrderPlan;
  readiness: MainnetTinyReadiness;
}

export interface MainnetCancelAccepted {
  result: "MAINNET_CANCEL_SENT";
  orderCanceled: true;
  cancelCalled: true;
  exchangeResponse: BinanceOrderResponse;
}

export class MainnetTinyRefusal extends Error {
  constructor(readonly reason: string, readonly context: Record<string, unknown> = {}) {
    super(reason);
    this.name = "MainnetTinyRefusal";
  }
}

export async function executeMainnetTinyOrder(input: {
  config: RuntimeConfig;
  env: MainnetTinyEnv;
  rest: MainnetTinyRest;
}): Promise<MainnetTinyAccepted> {
  assertMainnetTinyEnvironment(input.config, input.env);
  const exchangeInfo = await input.rest.exchangeInfo();
  const selectedSymbol = selectedMainnetTinySymbol(input.env);
  const exchangeSymbol = exchangeInfo.symbols.find((candidate) => candidate.symbol === selectedSymbol);
  if (exchangeSymbol === undefined) refuse(`${selectedSymbol}_missing_from_exchangeInfo`);
  if (exchangeSymbol.status !== "TRADING") refuse(`${selectedSymbol}_status_${exchangeSymbol.status}`);

  const filters = symbolFilters(exchangeSymbol);
  assertFilters(filters);
  const serverTime = await input.rest.serverTime();
  const clockOffsetMs = Math.abs(serverTime.serverTime - Date.now());
  const positionMode = await readPositionMode(input.rest);
  const [balances, openOrders, positions] = await Promise.all([
    input.rest.accountBalance(),
    input.rest.openOrders(selectedSymbol),
    input.rest.positionRisk(selectedSymbol)
  ]);
  const ticker = await input.rest.publicRequest<{ bidPrice?: string; askPrice?: string }>("GET", "/fapi/v1/ticker/bookTicker", { symbol: selectedSymbol });
  const premium = await input.rest.publicRequest<{ markPrice?: string }>("GET", "/fapi/v1/premiumIndex", { symbol: selectedSymbol });
  const plan = buildMainnetTinyOrderPlan({
    config: input.config,
    env: input.env,
    symbol: selectedSymbol,
    filters,
    ticker,
    premium
  });
  const readiness = buildReadiness(input.env, balances, openOrders, positions, clockOffsetMs, positionMode);
  assertMainnetTinyReadiness({
    config: input.config,
    env: input.env,
    openOrders,
    positions,
    balances,
    plan,
    readiness
  });

  const exchangeResponse = await input.rest.newOrder({
    symbol: selectedSymbol,
    side: "BUY",
    type: "LIMIT",
    quantity: plan.quantity,
    price: plan.price,
    timeInForce: "GTX",
    reduceOnly: false,
    newClientOrderId: plan.clientOrderId
  });
  const cleanupRequired = exchangeResponse.status === "NEW" || exchangeResponse.status === "PARTIALLY_FILLED";
  const postOrderOpenOrders = await input.rest.openOrders(selectedSymbol);
  const reconciliationOpenOrderFound = postOrderOpenOrders.some((order) => order.orderId === exchangeResponse.orderId || order.clientOrderId === plan.clientOrderId);
  if (cleanupRequired && !reconciliationOpenOrderFound) refuse("post_order_reconciliation_failed_open_order_missing");
  return {
    result: "MAINNET_TINY_LIMIT_ACCEPTED",
    orderAccepted: true,
    newOrderCalled: true,
    orderId: exchangeResponse.orderId,
    cleanupRequired,
    safeForRepeatedMainnetExecutions: !cleanupRequired,
    ...(cleanupRequired ? { cancelCommand: `pnpm cancel:mainnet -- --symbol ${selectedSymbol} --orderId ${exchangeResponse.orderId}` } : {}),
    exchangeResponse,
    reconciliationOpenOrderFound,
    plan,
    readiness: { ...readiness, postOrderReconciled: reconciliationOpenOrderFound }
  };
}

export async function executeMainnetCancel(input: {
  config: RuntimeConfig;
  env: MainnetTinyEnv;
  rest: MainnetTinyRest;
  symbol?: string;
  orderId?: string;
}): Promise<MainnetCancelAccepted> {
  assertMainnetCancelEnvironment(input.config, input.env, input.symbol, input.orderId);
  const exchangeResponse = await input.rest.cancelOrder(input.symbol ?? "", input.orderId ?? "");
  return {
    result: "MAINNET_CANCEL_SENT",
    orderCanceled: true,
    cancelCalled: true,
    exchangeResponse
  };
}

export function assertMainnetTinyEnvironment(config: RuntimeConfig, env: MainnetTinyEnv): void {
  assertMainnetBaseEnvironment(config);
  if (config.killSwitch) refuse("KILL_SWITCH_must_be_false");
  if (env.ALLOW_MAINNET_TINY_ORDER !== "true") refuse("ALLOW_MAINNET_TINY_ORDER_must_be_true");
  if (env.MAINNET_TINY_ORDER_CONFIRMATION !== MAINNET_TINY_ORDER_CONFIRMATION) refuse("MAINNET_TINY_ORDER_CONFIRMATION_missing");
  if (env.MAINNET_TINY_ORDER_RUN_ID === undefined || sanitizeRunId(env.MAINNET_TINY_ORDER_RUN_ID).length === 0) refuse("MAINNET_TINY_ORDER_RUN_ID_required_for_deterministic_clientOrderId");
  selectedMainnetTinySymbol(env);
  assertExplicitUsdCap("MAX_ORDER_NOTIONAL_USD", env.MAX_ORDER_NOTIONAL_USD, config.maxOrderNotionalUsd);
  assertExplicitUsdCap("MAX_EXPOSURE_USD", env.MAX_EXPOSURE_USD, config.maxExposureUsd);
  if (env.MAINNET_DAILY_LOSS_USD === undefined) refuse("MAINNET_DAILY_LOSS_USD_required");
  if (env.MAINNET_DAILY_LOSS_STATE_FRESH !== "true") refuse("MAINNET_DAILY_LOSS_STATE_FRESH_must_be_true");
  if (decimalCompare(env.MAINNET_DAILY_LOSS_USD, String(config.maxDailyLossUsd)) > 0) refuse("MAINNET_DAILY_LOSS_USD_exceeds_MAX_DAILY_LOSS_USD");
  if (env.MAINNET_SURVIVABILITY_SNAPSHOT_READY !== "true") refuse("MAINNET_SURVIVABILITY_SNAPSHOT_READY_must_be_true");
  if (env.MAINNET_SURVIVABILITY_SNAPSHOT_DEGRADED !== "false") refuse("MAINNET_SURVIVABILITY_SNAPSHOT_DEGRADED_must_be_false");
}

export function assertMainnetCancelEnvironment(config: RuntimeConfig, env: MainnetTinyEnv, symbol?: string, orderId?: string): void {
  assertMainnetBaseEnvironment(config);
  if (env.MAINNET_CANCEL_CONFIRMATION !== MAINNET_CANCEL_CONFIRMATION) refuse("MAINNET_CANCEL_CONFIRMATION_missing");
  parseAllowedMainnetTinySymbol(symbol);
  if (orderId === undefined || !/^\d+$/.test(orderId)) refuse("numeric_orderId_required");
}

export function buildMainnetTinyOrderPlan(input: {
  config: RuntimeConfig;
  env: MainnetTinyEnv;
  symbol: MainnetTinySymbol;
  filters: SymbolFilters;
  ticker: { bidPrice?: string; askPrice?: string };
  premium: { markPrice?: string };
}): MainnetTinyOrderPlan {
  const bidPrice = input.ticker.bidPrice === undefined ? undefined : decimalNormalize(input.ticker.bidPrice);
  const askPrice = input.ticker.askPrice === undefined ? undefined : decimalNormalize(input.ticker.askPrice);
  const markPrice = input.premium.markPrice === undefined ? undefined : decimalNormalize(input.premium.markPrice);
  if (bidPrice === undefined || decimalCompare(bidPrice, "0") <= 0) refuse("price_source_unavailable");
  if (askPrice === undefined || decimalCompare(askPrice, "0") <= 0) refuse("ask_price_unavailable");
  if (markPrice === undefined || decimalCompare(markPrice, "0") <= 0) refuse("mark_price_unavailable");
  if (decimalCompare(askPrice, bidPrice) <= 0) refuse("spread_invalid");
  if (input.filters.minNotional === undefined) refuse("minNotional_missing");
  if (decimalCompare(input.filters.minNotional, String(input.config.maxOrderNotionalUsd)) > 0) {
    refuse("binance_minNotional_exceeds_MAX_ORDER_NOTIONAL_USD");
  }
  const rawPrice = decimalMultiply(bidPrice, "0.999", 8);
  const price = decimalMax(roundDown(rawPrice, input.filters.tickSize ?? "0.1"), input.filters.minPrice ?? input.filters.tickSize ?? "0.1");
  assertPrecisionChangeWithinTolerance("price", rawPrice, price, input.filters.tickSize ?? "0.1");
  if (decimalCompare(price, bidPrice) >= 0) refuse("selected_limit_price_crosses_or_touches_best_bid");
  if (decimalCompare(price, askPrice) >= 0) refuse("selected_limit_price_crosses_spread");
  const rawQuantity = decimalDivide(input.filters.minNotional, price, 12);
  const quantity = decimalMax(roundUp(rawQuantity, input.filters.stepSize ?? "0.0001"), input.filters.minQty ?? "0.0001");
  assertPrecisionChangeWithinTolerance("quantity", rawQuantity, quantity, input.filters.stepSize ?? "0.0001");
  const notional = decimalMultiply(price, quantity, 8);
  if (decimalCompare(notional, String(input.config.maxOrderNotionalUsd)) > 0) {
    refuse("computed_notional_exceeds_MAX_ORDER_NOTIONAL_USD", {
      computedPrice: price,
      computedQuantity: quantity,
      computedNotional: notional,
      maxOrderNotionalUsd: String(input.config.maxOrderNotionalUsd),
      binanceMinNotional: input.filters.minNotional,
      stepSize: input.filters.stepSize,
      tickSize: input.filters.tickSize,
      markPrice,
      bestBid: bidPrice,
      selectedPrice: price
    });
  }
  return {
    clientOrderId: `mainnet_tiny_${input.symbol}_${sanitizeRunId(input.env.MAINNET_TINY_ORDER_RUN_ID ?? "")}`.slice(0, 36),
    symbol: input.symbol,
    side: "BUY",
    type: "LIMIT",
    timeInForce: "GTX",
    reduceOnly: false,
    quantity,
    price,
    notional,
    priceSource: { source: "bookTicker.bidPrice", bidPrice, askPrice, markPrice, spread: decimalSubtract(askPrice, bidPrice), safeOffset: "0.999" },
    filters: input.filters
  };
}

function assertMainnetTinyReadiness(input: {
  config: RuntimeConfig;
  env: MainnetTinyEnv;
  openOrders: BinanceOpenOrder[];
  positions: BinancePositionRisk[];
  balances: BinanceAccountBalance[];
  plan: MainnetTinyOrderPlan;
  readiness: MainnetTinyReadiness;
}): void {
  if (input.balances.length === 0) refuse("account_balance_unavailable");
  if (input.openOrders.length > 0) refuse(`${input.plan.symbol}_open_order_exists`);
  if (input.openOrders.some((order) => order.clientOrderId === input.plan.clientOrderId)) refuse("duplicate_clientOrderId");
  if (input.positions.length === 0) refuse(`${input.plan.symbol}_position_risk_unavailable`);
  if (decimalCompare(input.readiness.positionAmount, "0") !== 0) refuse(`${input.plan.symbol}_position_amount_nonzero`);
  if (decimalCompare(input.readiness.leverage, "2") > 0) refuse(`${input.plan.symbol}_leverage_exceeds_2`);
  if (!input.readiness.exposureKnown) refuse("exposure_unknown");
  const maxClockOffsetMs = Number(input.env.MAINNET_MAX_CLOCK_OFFSET_MS ?? "1000");
  if (!Number.isFinite(maxClockOffsetMs) || input.readiness.clockOffsetMs > maxClockOffsetMs) refuse("clock_offset_exceeds_tolerance");
  const expectedPositionMode = input.env.MAINNET_EXPECTED_POSITION_MODE ?? "ONE_WAY";
  if (input.readiness.positionMode !== expectedPositionMode) refuse("position_mode_mismatch");
  const projectedExposure = decimalAdd(input.readiness.currentPositionNotional, input.plan.notional);
  if (decimalCompare(projectedExposure, String(input.config.maxExposureUsd)) > 0) refuse("projected_exposure_exceeds_MAX_EXPOSURE_USD");
}

function assertMainnetBaseEnvironment(config: RuntimeConfig): void {
  if (config.runtimeProfile !== "LIVE") refuse("RUNTIME_PROFILE_must_be_LIVE");
  if (config.dryRun) refuse("DRY_RUN_must_be_false");
  if (config.binanceUseTestnet) refuse("BINANCE_USE_TESTNET_must_be_false");
  if (normalizeEndpoint(config.binanceFuturesRestUrl) !== BINANCE_FUTURES_PRODUCTION_REST_URL) refuse("mainnet_rest_endpoint_required");
  if (normalizeEndpoint(config.binanceFuturesUserStreamBaseUrl) !== BINANCE_FUTURES_PRODUCTION_USER_STREAM_BASE_URL) refuse("mainnet_user_stream_endpoint_required");
  if (normalizeEndpoint(config.binanceFuturesMarketWsBaseUrl) !== BINANCE_FUTURES_PRODUCTION_MARKET_WS_BASE_URL) refuse("mainnet_market_ws_endpoint_required");
  if (normalizeEndpoint(config.binanceFuturesWsApiUrl) !== BINANCE_FUTURES_PRODUCTION_WS_API_URL) refuse("mainnet_ws_api_endpoint_required");
  if (config.liveTradingConfirmation !== LIVE_TRADING_CONFIRMATION) refuse("LIVE_TRADING_CONFIRMATION_missing");
  if (config.binanceApiKey.length === 0 || config.binanceApiSecret.length === 0) refuse("BINANCE_API_KEY_and_BINANCE_API_SECRET_required");
  const endpointIssues = validateBinanceEndpointMode(config);
  if (endpointIssues.length > 0) refuse(endpointIssues.map((issue) => issue.message).join("; "));
}

function assertExplicitUsdCap(name: "MAX_ORDER_NOTIONAL_USD" | "MAX_EXPOSURE_USD", rawValue: string | undefined, value: number): void {
  if (rawValue === undefined || rawValue.length === 0 || !Number.isFinite(value)) refuse(`${name}_missing`);
  if (decimalCompare(String(value), "60") > 0) refuse(`${name}_must_be_lte_60`);
}

function buildReadiness(env: MainnetTinyEnv, balances: BinanceAccountBalance[], openOrders: BinanceOpenOrder[], positions: BinancePositionRisk[], clockOffsetMs: number, positionMode: "ONE_WAY" | "HEDGE"): MainnetTinyReadiness {
  const currentPositionNotional = positions.reduce((total, position) => decimalAdd(total, decimalAbs(decimalNormalize(position.notional))), "0");
  return {
    accountBalanceAssets: balances.length,
    openOrdersCount: openOrders.length,
    positionAmount: positions[0]?.positionAmt ?? "UNKNOWN",
    leverage: positions[0]?.leverage ?? "UNKNOWN",
    exposureKnown: positions.length > 0,
    currentPositionNotional,
    dailyLossUsd: env.MAINNET_DAILY_LOSS_USD ?? "UNKNOWN",
    survivabilitySnapshotReady: env.MAINNET_SURVIVABILITY_SNAPSHOT_READY === "true",
    survivabilitySnapshotDegraded: env.MAINNET_SURVIVABILITY_SNAPSHOT_DEGRADED !== "false",
    clockOffsetMs,
    positionMode,
    postOrderReconciled: false,
    persistenceCheckpointIntegrated: false
  };
}

function selectedMainnetTinySymbol(env: MainnetTinyEnv): MainnetTinySymbol {
  return parseAllowedMainnetTinySymbol(env.MAINNET_TINY_SYMBOL ?? DEFAULT_MAINNET_TINY_SYMBOL);
}

function parseAllowedMainnetTinySymbol(symbol: string | undefined): MainnetTinySymbol {
  const normalized = symbol?.toUpperCase();
  if (normalized === "ETHUSDT" || normalized === "BTCUSDT") return normalized;
  refuse("symbol_must_be_ETHUSDT_or_BTCUSDT");
}

async function readPositionMode(rest: MainnetTinyRest): Promise<"ONE_WAY" | "HEDGE"> {
  const response = await rest.signedRequest<{ dualSidePosition?: boolean }>("GET", "/fapi/v1/positionSide/dual");
  if (typeof response.dualSidePosition !== "boolean") refuse("position_mode_unavailable");
  return response.dualSidePosition ? "HEDGE" : "ONE_WAY";
}

export interface SymbolFilters {
  minPrice?: string | undefined;
  tickSize?: string | undefined;
  stepSize?: string | undefined;
  minQty?: string | undefined;
  maxQty?: string | undefined;
  minNotional?: string | undefined;
}

export function symbolFilters(symbolInfo: BinanceExchangeSymbol): SymbolFilters {
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

function assertFilters(filters: SymbolFilters): void {
  if (filters.tickSize === undefined) refuse("PRICE_FILTER_tickSize_missing");
  if (filters.stepSize === undefined) refuse("LOT_SIZE_stepSize_missing");
  if (filters.minQty === undefined) refuse("LOT_SIZE_minQty_missing");
  if (filters.minNotional === undefined) refuse("MIN_NOTIONAL_missing");
}

function sanitizeRunId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
}

function refuse(reason: string, context: Record<string, unknown> = {}): never {
  throw new MainnetTinyRefusal(reason, context);
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
  const normalized = value.trim();
  if (normalized === "UNKNOWN" || normalized.length === 0) refuse("invalid_decimal_value");
  const [whole, fraction = ""] = normalized.split(".");
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

function decimalSubtract(left: string, right: string): string {
  const scale = Math.max(decimalScale(left), decimalScale(right));
  return decimalFromBigInt(decimalToBigInt(left, scale) - decimalToBigInt(right, scale), scale);
}

function decimalMax(left: string, right: string): string {
  return decimalCompare(left, right) >= 0 ? left : right;
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

function assertPrecisionChangeWithinTolerance(kind: "price" | "quantity", intended: string, normalized: string, increment: string): void {
  const change = decimalAbs(decimalSubtract(intended, normalized));
  if (decimalCompare(change, increment) > 0) refuse(`${kind}_normalization_materially_changed_value`);
}

export function mainnetTinyRefusalPayload(reason: string, context: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    result: "MAINNET_TINY_LIMIT_REFUSED",
    reason,
    ...context,
    orderPlaced: false,
    newOrderCalled: false
  };
}

export function mainnetCancelRefusalPayload(reason: string): Record<string, unknown> {
  return {
    result: "MAINNET_CANCEL_REFUSED",
    reason,
    orderCanceled: false,
    cancelCalled: false
  };
}

export function mainnetExchangeErrorPayload(error: BinanceRestError, result: string): Record<string, unknown> {
  return {
    result,
    exchangeResponse: {
      status: error.status,
      code: error.code,
      msg: error.msg,
      endpoint: error.endpoint
    },
    reason: error.message
  };
}
