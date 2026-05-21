import WebSocket from "ws";
import type { EventInput, RuntimeEvent } from "../core/event.js";
import { rootCorrelationId } from "../core/ids.js";
import { ExchangePayloadGuard } from "../bridge/ExchangePayloadGuard.js";
import type { ExchangeTruth } from "../core/StartupTruthReconciler.js";
import { BINANCE_FUTURES_TESTNET_USER_STREAM_BASE_URL, type RuntimeConfig } from "../infra/config.js";
import {
  BinanceRest,
  BinanceRestError,
  BINANCE_FUTURES_PRODUCTION_REST_URL,
  BINANCE_FUTURES_TESTNET_REST_URL,
  type BinanceExchangeInfo,
  type BinanceExchangeSymbol,
  type BinanceOrderRequest,
  type BinanceOrderResponse,
  type BinancePositionRisk
} from "../adapters/binance/binance-rest.js";

export type BinanceLiveExecutionLifecycleAction =
  | "connected"
  | "disconnected"
  | "partitioned"
  | "reconnecting"
  | "recovered"
  | "sequence_gap"
  | "fatal_shutdown";

export interface BinanceLiveExecutionLifecycleEvent {
  action: BinanceLiveExecutionLifecycleAction;
  symbol?: string;
  reason?: string;
}

export type BinanceLiveExecutionEventSink = (event: EventInput) => Promise<void> | void;
export type BinanceLiveExecutionLifecycleSink = (event: BinanceLiveExecutionLifecycleEvent) => Promise<void> | void;

export interface BinanceExecutionReport {
  symbol: string;
  executionType: "TRADE" | "REJECTED" | "ACCOUNT_UPDATE" | "NEW";
  orderId?: string;
  clientOrderId?: string;
  side?: "BUY" | "SELL";
  quantity?: number;
  price?: number;
  positionQuantity?: number;
  realizedPnl?: number | undefined;
  orderStatus?: string | undefined;
  rejectReason?: string | undefined;
  eventTime?: number;
  transactionTime?: number;
}

type LiveExecutionConfig = Pick<
  RuntimeConfig,
  | "runtimeProfile"
  | "dryRun"
  | "killSwitch"
  | "liveTradingConfirmation"
  | "binanceApiKey"
  | "binanceApiSecret"
  | "binanceUseTestnet"
  | "binanceFuturesRestUrl"
  | "binanceFuturesUserStreamBaseUrl"
  | "binanceSymbols"
  | "maxOrderNotionalUsd"
  | "maxExposureUsd"
  | "maxDailyLossUsd"
  | "maxLeverage"
  | "allowMarketOrders"
>;

export interface BinanceLiveExecutionOptions {
  config?: Partial<LiveExecutionConfig>;
  rest?: BinanceRest;
  nowMs?: () => number;
  snapshotTtlMs?: number;
}

interface SymbolFilters {
  tickSize: string | undefined;
  stepSize: string | undefined;
  minQty: string | undefined;
  maxQty: string | undefined;
  minNotional: string | undefined;
}

export interface LiveExecutionSurvivabilitySnapshot {
  readonly status: "LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_READY" | "LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_DEGRADED";
  readonly updatedAt: number;
  readonly symbols: readonly string[];
  readonly failures: readonly string[];
  readonly evidenceIds: readonly string[];
}

const LIVE_CONFIRMATION = "I_UNDERSTAND_THIS_TRADES_REAL_MONEY";
const USER_STREAM_KEEPALIVE_MS = 30 * 60 * 1_000;
const ACCOUNT_DAILY_LOSS_KEY = "__ACCOUNT__";
const USD_SCALE = 8;

export class BinanceLiveExecution {
  private connected = false;
  private exchangeInfoCache?: BinanceExchangeInfo;
  private listenKey: string | undefined;
  private userStream: WebSocket | undefined;
  private keepaliveTimer: NodeJS.Timeout | undefined;
  private readonly dailyRealizedPnlUsd = new Map<string, { day: string; value: number; updatedAt: number }>();
  private readonly dailyRealizedPnlUnits = new Map<string, { day: string; value: bigint; updatedAt: number }>();
  private readonly symbolFilters = new Map<string, SymbolFilters>();
  private readonly exposureNotional = new Map<string, string>();
  private readonly openPositionSymbols = new Set<string>();
  private readonly snapshotUpdatedAt = new Map<string, number>();
  private readonly degradationReasons = new Set<string>();
  private readonly pendingClientOrderIds = new Set<string>();
  private readonly submittedClientOrderIds = new Set<string>();
  private feedUnsafeReason: string | undefined;
  private readonly rest: BinanceRest;
  private readonly nowMs: () => number;
  private readonly snapshotTtlMs: number;
  private readonly payloadGuard = new ExchangePayloadGuard({ maxBytes: 256 * 1024 });
  private readonly config: LiveExecutionConfig;

  constructor(
    private readonly eventSink: BinanceLiveExecutionEventSink,
    private readonly lifecycleSink: BinanceLiveExecutionLifecycleSink = () => undefined,
    options: BinanceLiveExecutionOptions = {}
  ) {
    this.config = {
      runtimeProfile: options.config?.runtimeProfile ?? "PAPER",
      dryRun: options.config?.dryRun ?? true,
      killSwitch: options.config?.killSwitch ?? false,
      liveTradingConfirmation: options.config?.liveTradingConfirmation ?? "",
      binanceApiKey: options.config?.binanceApiKey ?? "",
      binanceApiSecret: options.config?.binanceApiSecret ?? "",
      binanceUseTestnet: options.config?.binanceUseTestnet ?? true,
      binanceFuturesRestUrl: options.config?.binanceFuturesRestUrl ?? (options.config?.binanceUseTestnet === false ? BINANCE_FUTURES_PRODUCTION_REST_URL : BINANCE_FUTURES_TESTNET_REST_URL),
      binanceFuturesUserStreamBaseUrl: options.config?.binanceFuturesUserStreamBaseUrl ?? BINANCE_FUTURES_TESTNET_USER_STREAM_BASE_URL,
      binanceSymbols: options.config?.binanceSymbols ?? ["BTCUSDT"],
      maxOrderNotionalUsd: options.config?.maxOrderNotionalUsd ?? 10,
      maxExposureUsd: options.config?.maxExposureUsd ?? 1_000,
      maxDailyLossUsd: options.config?.maxDailyLossUsd ?? 100,
      maxLeverage: options.config?.maxLeverage ?? 1,
      allowMarketOrders: options.config?.allowMarketOrders ?? false
    };
    const baseUrl = this.config.binanceFuturesRestUrl
      ?? (this.config.binanceUseTestnet ? BINANCE_FUTURES_TESTNET_REST_URL : BINANCE_FUTURES_PRODUCTION_REST_URL);
    this.rest = options.rest ?? new BinanceRest({
      baseUrl,
      apiKey: this.config.binanceApiKey,
      apiSecret: this.config.binanceApiSecret,
      useTestnet: this.config.binanceUseTestnet
    });
    this.nowMs = options.nowMs ?? Date.now;
    this.snapshotTtlMs = options.snapshotTtlMs ?? 10_000;
  }

  async refreshSurvivabilitySnapshot(symbols: readonly string[] = this.config.binanceSymbols, evidenceIds: readonly string[] = ["live_execution_survivability_snapshot"]): Promise<LiveExecutionSurvivabilitySnapshot> {
    if (evidenceIds.length === 0) throw new Error("live_execution_survivability_snapshot_requires_evidence");
    const updatedAt = this.nowMs();
    const normalizedSymbols = symbols.map((symbol) => symbol.toUpperCase());
    const failures: string[] = [];
    this.degradationReasons.clear();

    let exchangeInfo: BinanceExchangeInfo | undefined;
    try {
      exchangeInfo = await this.rest.exchangeInfo();
      this.exchangeInfoCache = exchangeInfo;
    } catch {
      failures.push("exchange_info_unavailable");
    }

    if (exchangeInfo !== undefined) {
      for (const symbol of normalizedSymbols) {
        const exchangeSymbol = exchangeInfo.symbols.find((candidate) => candidate.symbol === symbol);
        if (exchangeSymbol === undefined) {
          failures.push(`symbol_unknown:${symbol}`);
          continue;
        }
        if (exchangeSymbol.status !== "TRADING") {
          failures.push(`symbol_not_trading:${symbol}`);
          continue;
        }
        const filters = this.extractFilters(exchangeSymbol);
        if (filters.stepSize === undefined || filters.tickSize === undefined) {
          failures.push(`symbol_filters_incomplete:${symbol}`);
          continue;
        }
        this.symbolFilters.set(symbol, filters);
        this.snapshotUpdatedAt.set(symbol, updatedAt);
      }
    }

    for (const symbol of normalizedSymbols) {
      try {
        const positions = await this.rest.positionRisk(symbol);
        const exposure = exposureNotionalForSymbol(positions, symbol);
        this.exposureNotional.set(symbol, exposure);
        if (hasOpenPositionForSymbol(positions, symbol)) {
          this.openPositionSymbols.add(symbol);
        } else {
          this.openPositionSymbols.delete(symbol);
        }
        this.snapshotUpdatedAt.set(symbol, updatedAt);
      } catch {
        failures.push(`position_risk_unavailable:${symbol}`);
      }
    }

    for (const failure of failures) this.degradationReasons.add(failure);
    return {
      status: failures.length === 0 ? "LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_READY" : "LIVE_EXECUTION_SURVIVABILITY_SNAPSHOT_DEGRADED",
      updatedAt,
      symbols: normalizedSymbols,
      failures,
      evidenceIds: [...evidenceIds]
    };
  }

  async fetchStartupExchangeTruth(evidenceIds: readonly string[] = ["startup_exchange_truth"]): Promise<ExchangeTruth> {
    if (evidenceIds.length === 0) throw new Error("startup_exchange_truth_requires_evidence");
    const [balances, openOrders, positions] = await Promise.all([
      this.rest.accountBalance(),
      this.rest.openOrders(),
      this.rest.positionRisk()
    ]);
    return { balances, openOrders, positions, evidenceIds: [...evidenceIds] };
  }

  async connectUserStream(symbols: readonly string[]): Promise<void> {
    if (symbols.length === 0) {
      throw new Error("live_execution_user_stream_requires_symbol");
    }
    this.assertUserStreamCredentials();
    const listenKey = (await this.rest.createListenKey()).listenKey;
    if (listenKey.length === 0) throw new Error("binance_listen_key_empty");
    this.listenKey = listenKey;
    this.connected = true;
    this.openUserStream(listenKey);
    this.keepaliveTimer = setInterval(() => {
      void this.keepaliveListenKey();
    }, USER_STREAM_KEEPALIVE_MS);
    this.keepaliveTimer.unref?.();
    for (const symbol of symbols) {
      await this.lifecycleSink({ action: "connected", symbol: symbol.toUpperCase(), reason: "user_stream_connected" });
    }
  }

  close(): void {
    this.connected = false;
    if (this.keepaliveTimer !== undefined) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = undefined;
    }
    this.userStream?.close();
    this.userStream = undefined;
    const listenKey = this.listenKey;
    this.listenKey = undefined;
    if (listenKey !== undefined && this.hasApiCredentials()) {
      void this.rest.closeListenKey(listenKey).catch(() => undefined);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async submitOrder(event: RuntimeEvent): Promise<void> {
    if (event.eventType !== "ORDER_SUBMITTED") {
      throw new Error("live_execution_requires_order_submitted");
    }
    const gateFailure = this.firstSafetyGateFailure(event);
    if (gateFailure !== undefined) {
      await this.emitOrderRejected(event, gateFailure);
      return;
    }
    try {
      const order = await this.toBinanceOrder(event);
      this.reserveClientOrderId(order.newClientOrderId);
      const response = await this.rest.newOrder(order);
      this.pendingClientOrderIds.delete(order.newClientOrderId);
      this.submittedClientOrderIds.add(order.newClientOrderId);
      await this.eventSink(this.orderAcceptedEvent(event, response));
    } catch (error) {
      if (error instanceof BinanceRestError) {
        if (error.status === 401 || error.status === 403 || error.code === -2015) {
          await this.lifecycleSink({ action: "fatal_shutdown", reason: "fatal_exchange_auth_state" });
          await this.eventSink(this.executionErrorEvent(event, "fatal_exchange_auth_state"));
          throw error;
        }
        await this.emitOrderRejected(event, error.msg, { status: error.status, code: error.code, endpoint: error.endpoint });
        return;
      }
      await this.eventSink(this.executionErrorEvent(event, error instanceof Error ? error.message : "execution_error"));
      throw error;
    }
  }

  async onExecutionReport(report: BinanceExecutionReport): Promise<void> {
    this.updateDailyLossStateFromReport(report);
    await this.eventSink(this.normalizeExecutionReport(report));
  }

  observeDailyRealizedPnl(symbol: string, realizedPnlUsd: number, timestampMs = this.nowMs()): void {
    if (!Number.isFinite(realizedPnlUsd)) return;
    const key = symbol.toUpperCase();
    const day = utcDay(timestampMs);
    const current = this.dailyRealizedPnlUsd.get(key);
    const value = current?.day === day ? current.value + realizedPnlUsd : realizedPnlUsd;
    this.dailyRealizedPnlUsd.set(key, { day, value, updatedAt: timestampMs });

    const units = decimalToUnits(String(realizedPnlUsd), USD_SCALE);
    const currentUnits = this.dailyRealizedPnlUnits.get(key);
    const valueUnits = currentUnits?.day === day ? currentUnits.value + units : units;
    this.dailyRealizedPnlUnits.set(key, { day, value: valueUnits, updatedAt: timestampMs });
  }

  currentDailyLossUsd(symbol: string, timestampMs = this.nowMs()): number | undefined {
    const day = utcDay(timestampMs);
    const symbolState = this.dailyRealizedPnlUsd.get(symbol.toUpperCase());
    if (symbolState?.day === day) return Math.max(0, -symbolState.value);
    const accountState = this.dailyRealizedPnlUsd.get(ACCOUNT_DAILY_LOSS_KEY);
    if (accountState?.day === day) return Math.max(0, -accountState.value);
    return undefined;
  }

  async onLifecycle(event: BinanceLiveExecutionLifecycleEvent): Promise<void> {
    if (event.action === "connected" || event.action === "recovered") {
      this.feedUnsafeReason = undefined;
    }
    if (event.action === "disconnected" || event.action === "partitioned" || event.action === "reconnecting" || event.action === "sequence_gap") {
      this.feedUnsafeReason = event.reason ?? event.action;
    }
    await this.lifecycleSink(event);
  }

  private firstSafetyGateFailure(event: RuntimeEvent): string | undefined {
    if (this.config.killSwitch) return "kill_switch_enabled";
    if (this.config.runtimeProfile !== "LIVE") return "runtime_profile_not_live";
    if (this.config.dryRun) return "dry_run_enabled";
    if (this.config.binanceUseTestnet) return "binance_testnet_enabled_for_live_order";
    if (!isProductionEndpoint(this.config.binanceFuturesRestUrl)) return "binance_production_endpoint_required";
    if (this.config.liveTradingConfirmation !== LIVE_CONFIRMATION) return "live_trading_confirmation_missing";
    if (!this.hasApiCredentials()) return "binance_credentials_missing";
    if (!this.config.binanceSymbols.includes(event.symbol.toUpperCase())) return "symbol_not_allowed";
    const idFailure = this.idempotencyKeyFailure(event);
    if (idFailure !== undefined) return idFailure;
    if (this.feedUnsafeReason !== undefined) return "market_feed_unsafe";
    if (this.orderType(event) === "MARKET" && !this.config.allowMarketOrders) return "market_orders_disabled";
    if (this.config.maxLeverage > 1) return "leverage_increase_not_allowed";
    const snapshotFailure = this.firstSnapshotFailure(event.symbol);
    if (snapshotFailure !== undefined) return snapshotFailure;
    if (this.openPositionSymbols.size > 0 && event.payload.reduceOnly !== true) return "one_position_rule_active";
    const dailyLossUsd = this.currentDailyLossUnits(event.symbol);
    if (dailyLossUsd === undefined) return "DAILY_LOSS_STATE_UNAVAILABLE";
    if (dailyLossUsd > decimalToUnits(String(this.config.maxDailyLossUsd), USD_SCALE)) return "daily_loss_limit";
    return undefined;
  }

  private updateDailyLossStateFromReport(report: BinanceExecutionReport): void {
    const timestamp = report.transactionTime ?? report.eventTime ?? this.nowMs();
    if (typeof report.realizedPnl === "number" && Number.isFinite(report.realizedPnl)) {
      this.observeDailyRealizedPnl(report.symbol, report.realizedPnl, timestamp);
    }
  }

  private async toBinanceOrder(event: RuntimeEvent): Promise<BinanceOrderRequest> {
    const idempotencyKey = this.idempotencyKey(event);
    const side = event.payload.side === "SELL" ? "SELL" : "BUY";
    const type = this.orderType(event);
    const filters = this.filtersForSymbol(event.symbol);
    const quantity = this.validateAndFormatQuantity(event, filters);
    const price = type === "LIMIT" ? this.validateAndFormatPrice(event, filters) : undefined;
    const notional = this.estimateNotional(event, quantity, price);
    if (filters.minNotional !== undefined && decimalCompare(notional, filters.minNotional) < 0) {
      throw new BinanceRestError("local_min_notional_invalid", 0, undefined, "min_notional_invalid", "/local/exchangeInfo");
    }
    if (decimalCompare(notional, String(this.config.maxOrderNotionalUsd)) > 0) throw new BinanceRestError("local_order_notional_limit", 0, undefined, "order_notional_limit", "/local/safety");
    this.assertExposureAllowed(event.symbol, notional);
    return {
      symbol: event.symbol.toUpperCase(),
      side,
      type,
      quantity,
      ...(price === undefined ? {} : { price, timeInForce: this.timeInForce(event) }),
      reduceOnly: event.payload.reduceOnly === true,
      newClientOrderId: idempotencyKey
    };
  }

  private assertExposureAllowed(symbol: string, orderNotional: string): void {
    if (this.openPositionSymbols.size > 0) return;
    const current = this.exposureNotional.get(symbol.toUpperCase());
    if (current === undefined) throw new BinanceRestError("local_position_snapshot_missing", 0, undefined, "position_snapshot_missing", "/local/safety");
    if (decimalCompare(decimalAdd(current, orderNotional), String(this.config.maxExposureUsd)) > 0) {
      throw new BinanceRestError("local_exposure_limit", 0, undefined, "max_exposure_limit", "/local/safety");
    }
  }

  private filtersForSymbol(symbol: string): SymbolFilters {
    const filters = this.symbolFilters.get(symbol.toUpperCase());
    if (filters === undefined) throw new BinanceRestError("local_exchange_snapshot_missing", 0, undefined, "exchange_snapshot_missing", "/local/exchangeInfo");
    return filters;
  }

  private extractFilters(symbol: BinanceExchangeSymbol): SymbolFilters {
    const filters: SymbolFilters = {
      tickSize: undefined,
      stepSize: undefined,
      minQty: undefined,
      maxQty: undefined,
      minNotional: undefined
    };
    for (const filter of symbol.filters) {
      if (filter.filterType === "PRICE_FILTER") filters.tickSize = filter.tickSize;
      if (filter.filterType === "LOT_SIZE") {
        filters.stepSize = filter.stepSize;
        filters.minQty = filter.minQty;
        filters.maxQty = filter.maxQty;
      }
      if (filter.filterType === "MIN_NOTIONAL" || filter.filterType === "NOTIONAL") {
        filters.minNotional = filter.minNotional ?? filter.notional;
      }
    }
    return filters;
  }

  private validateAndFormatQuantity(event: RuntimeEvent, filters: SymbolFilters): string {
    const quantity = this.payloadDecimal(event.payload.quantity, "quantity_required");
    if (filters.stepSize !== undefined && !decimalAligned(quantity, filters.stepSize)) {
      throw new BinanceRestError("local_quantity_step_invalid", 0, undefined, "quantity_step_invalid", "/local/exchangeInfo");
    }
    if (filters.minQty !== undefined && decimalCompare(quantity, filters.minQty) < 0) {
      throw new BinanceRestError("local_quantity_below_min", 0, undefined, "quantity_below_min", "/local/exchangeInfo");
    }
    if (filters.maxQty !== undefined && decimalCompare(quantity, filters.maxQty) > 0) {
      throw new BinanceRestError("local_quantity_above_max", 0, undefined, "quantity_above_max", "/local/exchangeInfo");
    }
    return decimalNormalize(quantity);
  }

  private validateAndFormatPrice(event: RuntimeEvent, filters: SymbolFilters): string {
    const price = this.payloadDecimal(event.payload.limitPrice ?? event.payload.price, "price_required");
    if (filters.tickSize !== undefined && !decimalAligned(price, filters.tickSize)) {
      throw new BinanceRestError("local_price_tick_invalid", 0, undefined, "price_tick_invalid", "/local/exchangeInfo");
    }
    return decimalNormalize(price);
  }

  private estimateNotional(event: RuntimeEvent, quantity: string, price?: string): string {
    const notionalPrice = price ?? this.payloadDecimal(event.payload.markPrice ?? event.payload.price, "market_order_notional_price_required");
    const notional = decimalMultiply(quantity, notionalPrice);
    if (decimalCompare(notional, "0") <= 0) {
      throw new BinanceRestError("local_order_notional_invalid", 0, undefined, "order_notional_invalid", "/local/safety");
    }
    return notional;
  }

  private payloadDecimal(value: unknown, reason: string): string {
    if (typeof value !== "string" && typeof value !== "number") {
      throw new BinanceRestError(`local_${reason}`, 0, undefined, reason, "/local/validation");
    }
    const decimal = String(value);
    if (!/^\d+(\.\d+)?$/.test(decimal) || decimalCompare(decimal, "0") <= 0) {
      throw new BinanceRestError(`local_${reason}`, 0, undefined, reason, "/local/validation");
    }
    return decimal;
  }

  private firstSnapshotFailure(symbol: string): string | undefined {
    if (this.degradationReasons.size > 0) return "survivability_snapshot_degraded";
    const normalizedSymbol = symbol.toUpperCase();
    if (!this.symbolFilters.has(normalizedSymbol)) return "exchange_snapshot_missing";
    if (!this.exposureNotional.has(normalizedSymbol)) return "position_snapshot_missing";
    const updatedAt = this.snapshotUpdatedAt.get(normalizedSymbol);
    if (updatedAt === undefined) return "survivability_snapshot_missing";
    if (this.nowMs() - updatedAt > this.snapshotTtlMs) return "survivability_snapshot_stale";
    return undefined;
  }

  private currentDailyLossUnits(symbol: string, timestampMs = this.nowMs()): bigint | undefined {
    const day = utcDay(timestampMs);
    const symbolState = this.dailyRealizedPnlUnits.get(symbol.toUpperCase());
    if (symbolState?.day === day) return symbolState.value < 0n ? -symbolState.value : 0n;
    const accountState = this.dailyRealizedPnlUnits.get(ACCOUNT_DAILY_LOSS_KEY);
    if (accountState?.day === day) return accountState.value < 0n ? -accountState.value : 0n;
    return undefined;
  }

  private idempotencyKey(event: RuntimeEvent): string {
    const failure = this.idempotencyKeyFailure(event);
    if (failure !== undefined) throw new BinanceRestError(`local_${failure}`, 0, undefined, failure, "/local/safety");
    return event.payload.idempotencyKey as string;
  }

  private idempotencyKeyFailure(event: RuntimeEvent): string | undefined {
    if (typeof event.payload.idempotencyKey !== "string" || event.payload.idempotencyKey.length === 0) return "live_execution_requires_idempotency_key";
    if (event.payload.idempotencyKey.length > 36) return "client_order_id_too_long";
    if (this.pendingClientOrderIds.has(event.payload.idempotencyKey) || this.submittedClientOrderIds.has(event.payload.idempotencyKey)) return "duplicate_client_order_id";
    return undefined;
  }

  private reserveClientOrderId(clientOrderId: string): void {
    if (this.pendingClientOrderIds.has(clientOrderId) || this.submittedClientOrderIds.has(clientOrderId)) {
      throw new BinanceRestError("local_duplicate_client_order_id", 0, undefined, "duplicate_client_order_id", "/local/safety");
    }
    this.pendingClientOrderIds.add(clientOrderId);
  }

  private orderType(event: RuntimeEvent): "MARKET" | "LIMIT" {
    return event.payload.type === "LIMIT" ? "LIMIT" : "MARKET";
  }

  private timeInForce(event: RuntimeEvent): "GTC" | "IOC" | "FOK" | "GTX" {
    const value = event.payload.timeInForce;
    return value === "IOC" || value === "FOK" || value === "GTX" ? value : "GTC";
  }

  private orderAcceptedEvent(event: RuntimeEvent, response: BinanceOrderResponse): EventInput {
    const now = this.nowMs();
    const exchangeTimestamp = response.updateTime ?? response.transactTime ?? now;
    return {
      eventId: `binance:order:accepted:${event.symbol}:${response.clientOrderId}:${response.orderId}`,
      timestamp: now,
      receiveTimestamp: now,
      processingTimestamp: now,
      exchangeTimestamp,
      source: "binance_user_ws",
      symbol: event.symbol,
      eventType: "ORDER_ACCEPTED",
      correlationId: event.correlationId,
      causationId: String(event.seq),
      payload: {
        orderId: response.orderId,
        orderClientId: response.clientOrderId,
        status: response.status,
        side: response.side,
        type: response.type,
        quantity: response.origQty,
        price: response.price,
        notional: safeIntendedNotional(event),
        reduceOnly: event.payload.reduceOnly === true,
        runtimeProfile: this.config.runtimeProfile,
        safetyGatesPassed: [
          "live_profile",
          "dry_run_disabled",
          "kill_switch_clear",
          "production_endpoint",
          "idempotency_reserved",
          "snapshot_fresh",
          "daily_loss_known",
          "order_notional_cap",
          "exposure_cap",
          "one_position_rule"
        ]
      }
    };
  }

  private async emitOrderRejected(event: RuntimeEvent, reason: string, extra: Record<string, unknown> = {}): Promise<void> {
    const now = this.nowMs();
    await this.eventSink({
      eventId: `binance:order:rejected:${event.symbol}:${this.rejectionKey(event)}:${reason}`,
      timestamp: now,
      receiveTimestamp: now,
      processingTimestamp: now,
      exchangeTimestamp: now,
      source: "binance_user_ws",
      symbol: event.symbol,
      eventType: "ORDER_REJECTED",
      correlationId: event.correlationId,
      causationId: String(event.seq),
      payload: {
        orderClientId: typeof event.payload.idempotencyKey === "string" ? event.payload.idempotencyKey : undefined,
        reason,
        status: "REJECTED",
        side: event.payload.side,
        quantity: event.payload.quantity,
        price: event.payload.limitPrice ?? event.payload.price ?? event.payload.markPrice,
        intendedNotional: safeIntendedNotional(event),
        runtimeProfile: this.config.runtimeProfile,
        killSwitch: this.config.killSwitch,
        clientOrderId: typeof event.payload.idempotencyKey === "string" ? event.payload.idempotencyKey : undefined,
        timestamp: now,
        ...extra
      }
    });
  }

  private executionErrorEvent(event: RuntimeEvent, reason: string): EventInput {
    const now = this.nowMs();
    return {
      eventId: `binance:execution:error:${event.symbol}:${this.rejectionKey(event)}:${now}`,
      timestamp: now,
      receiveTimestamp: now,
      processingTimestamp: now,
      exchangeTimestamp: now,
      source: "binance_user_ws",
      symbol: event.symbol,
      eventType: "EXECUTION_ERROR",
      correlationId: event.correlationId,
      causationId: String(event.seq),
      payload: { reason, status: "ERROR" }
    };
  }

  private rejectionKey(event: RuntimeEvent): string {
    return typeof event.payload.idempotencyKey === "string" ? event.payload.idempotencyKey : event.correlationId;
  }

  private normalizeExecutionReport(report: BinanceExecutionReport): EventInput {
    const now = report.eventTime ?? this.nowMs();
    const symbol = report.symbol.toUpperCase();
    const orderId = report.clientOrderId ?? report.orderId ?? "unknown_order";
    const correlationId = report.clientOrderId ?? rootCorrelationId();

    if (report.executionType === "NEW") {
      return {
        eventId: `binance:user:accepted:${symbol}:${orderId}:${report.transactionTime ?? now}`,
        timestamp: now,
        receiveTimestamp: now,
        processingTimestamp: now,
        exchangeTimestamp: report.transactionTime ?? now,
        source: "binance_user_ws",
        symbol,
        eventType: "ORDER_ACCEPTED",
        correlationId,
        causationId: orderId,
        payload: {
          orderId: report.orderId,
          orderClientId: report.clientOrderId,
          side: report.side,
          quantity: report.quantity,
          price: report.price,
          status: "ACCEPTED"
        }
      };
    }

    if (report.executionType === "TRADE") {
      return {
        eventId: `binance:user:fill:${symbol}:${orderId}:${report.transactionTime ?? now}`,
        timestamp: now,
        receiveTimestamp: now,
        processingTimestamp: now,
        exchangeTimestamp: report.transactionTime ?? now,
        source: "binance_user_ws",
        symbol,
        eventType: "ORDER_FILLED",
        correlationId,
        causationId: orderId,
        payload: {
          orderId: report.orderId,
          orderClientId: report.clientOrderId,
          side: report.side,
          quantity: report.quantity,
          price: report.price,
          status: report.orderStatus ?? "FILLED"
        }
      };
    }

    if (report.executionType === "REJECTED") {
      return {
        eventId: `binance:user:reject:${symbol}:${orderId}:${report.transactionTime ?? now}`,
        timestamp: now,
        receiveTimestamp: now,
        processingTimestamp: now,
        exchangeTimestamp: report.transactionTime ?? now,
        source: "binance_user_ws",
        symbol,
        eventType: "ORDER_REJECTED",
        correlationId,
        causationId: orderId,
        payload: {
          orderId: report.orderId,
          orderClientId: report.clientOrderId,
          reason: report.rejectReason ?? "exchange_rejected",
          status: "REJECTED"
        }
      };
    }

    return {
      eventId: `binance:user:position:${symbol}:${report.transactionTime ?? now}`,
      timestamp: now,
      receiveTimestamp: now,
      processingTimestamp: now,
      exchangeTimestamp: report.transactionTime ?? now,
      source: "binance_user_ws",
      symbol,
      eventType: "POSITION_UPDATED",
      correlationId,
      causationId: "account_update",
      payload: {
        quantity: report.positionQuantity,
        price: report.price
      }
    };
  }

  private openUserStream(listenKey: string): void {
    const wsUrl = `${this.config.binanceFuturesUserStreamBaseUrl.replace(/\/+$/, "")}/ws/${listenKey}`;
    this.userStream = new WebSocket(wsUrl);
    this.userStream.on("message", (data) => {
      void this.onUserStreamMessage(String(data)).catch((error) => {
        void this.lifecycleSink({ action: "partitioned", reason: error instanceof Error ? error.message : "user_stream_parse_failed" });
      });
    });
    this.userStream.on("close", () => {
      this.connected = false;
      void this.lifecycleSink({ action: "reconnecting", reason: "user_stream_closed" });
    });
    this.userStream.on("error", () => {
      void this.lifecycleSink({ action: "partitioned", reason: "user_stream_error" });
    });
  }

  private async keepaliveListenKey(): Promise<void> {
    if (this.listenKey === undefined) return;
    try {
      await this.rest.keepaliveListenKey(this.listenKey);
    } catch {
      await this.lifecycleSink({ action: "reconnecting", reason: "listen_key_keepalive_failed" });
    }
  }

  private async onUserStreamMessage(raw: string): Promise<void> {
    const message = this.payloadGuard.parseObject(raw);
    if (message.e === "ORDER_TRADE_UPDATE" && typeof message.o === "object" && message.o !== null) {
      const order = message.o as Record<string, unknown>;
      await this.onExecutionReport({
        symbol: String(order.s),
        executionType: order.x === "TRADE" ? "TRADE" : order.X === "REJECTED" || order.x === "REJECTED" ? "REJECTED" : "NEW",
        orderId: String(order.i ?? ""),
        clientOrderId: String(order.c ?? ""),
        side: order.S === "SELL" ? "SELL" : "BUY",
        quantity: Number(order.l ?? order.q ?? 0),
        price: Number(order.L ?? order.p ?? 0),
        realizedPnl: finiteNumber(order.rp),
        orderStatus: typeof order.X === "string" ? order.X : undefined,
        rejectReason: typeof order.r === "string" ? order.r : undefined,
        eventTime: Number(message.E ?? Date.now()),
        transactionTime: Number(order.T ?? message.T ?? message.E ?? Date.now())
      });
    }
    if (message.e === "ACCOUNT_UPDATE" && typeof message.a === "object" && message.a !== null) {
      const account = message.a as { B?: Array<Record<string, unknown>>; P?: Array<Record<string, unknown>> };
      for (const balance of account.B ?? []) {
        const balanceChange = finiteNumber(balance.bc);
        if (balanceChange !== undefined) {
          this.observeDailyRealizedPnl(ACCOUNT_DAILY_LOSS_KEY, balanceChange, Number(message.T ?? message.E ?? Date.now()));
        }
      }
      for (const position of account.P ?? []) {
        await this.onExecutionReport({
          symbol: String(position.s),
          executionType: "ACCOUNT_UPDATE",
          positionQuantity: Number(position.pa ?? 0),
          price: Number(position.ep ?? 0),
          eventTime: Number(message.E ?? Date.now()),
          transactionTime: Number(message.T ?? message.E ?? Date.now())
        });
      }
    }
  }

  private assertUserStreamCredentials(): void {
    if (!this.hasApiCredentials()) throw new Error("binance_credentials_missing");
  }

  private hasApiCredentials(): boolean {
    return this.config.binanceApiKey.length > 0 && this.config.binanceApiSecret.length > 0;
  }
}

function decimalNormalize(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function decimalAligned(value: string, step: string): boolean {
  const scale = Math.max(decimalScale(value), decimalScale(step));
  const scaledValue = decimalToBigInt(value, scale);
  const scaledStep = decimalToBigInt(step, scale);
  if (scaledStep === 0n) return true;
  return scaledValue % scaledStep === 0n;
}

function decimalCompare(left: string, right: string): number {
  const scale = Math.max(decimalScale(left), decimalScale(right));
  const leftValue = decimalToBigInt(left, scale);
  const rightValue = decimalToBigInt(right, scale);
  return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
}

function decimalAdd(left: string, right: string): string {
  const scale = Math.max(decimalScale(left), decimalScale(right));
  return decimalFromBigInt(decimalToBigInt(left, scale) + decimalToBigInt(right, scale), scale);
}

function decimalAbs(value: string): string {
  return value.startsWith("-") ? value.slice(1) : value;
}

function decimalMultiply(left: string, right: string): string {
  const scale = decimalScale(left) + decimalScale(right);
  return decimalFromBigInt(decimalToBigInt(left, decimalScale(left)) * decimalToBigInt(right, decimalScale(right)), scale);
}

function decimalScale(value: string): number {
  return value.includes(".") ? value.split(".")[1]?.length ?? 0 : 0;
}

function decimalToBigInt(value: string, scale: number): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const units = BigInt(`${whole}${fraction.padEnd(scale, "0")}`);
  return negative ? -units : units;
}

function decimalFromBigInt(value: bigint, scale: number): string {
  const negative = value < 0n;
  const unsigned = negative ? -value : value;
  const raw = unsigned.toString().padStart(scale + 1, "0");
  const whole = raw.slice(0, raw.length - scale);
  const fraction = raw.slice(raw.length - scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction.length === 0 ? "" : `.${fraction}`}`;
}

function decimalToUnits(value: string, scale: number): bigint {
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error("decimal_invalid");
  const valueScale = decimalScale(value);
  if (valueScale > scale) {
    const divisor = 10n ** BigInt(valueScale - scale);
    return decimalToBigInt(value, valueScale) / divisor;
  }
  return decimalToBigInt(value, scale);
}

function exposureNotionalForSymbol(positions: readonly BinancePositionRisk[], symbol: string): string {
  let total = "0";
  for (const position of positions) {
    if (position.symbol.toUpperCase() !== symbol.toUpperCase()) continue;
    if (!/^-?\d+(\.\d+)?$/.test(position.notional)) throw new BinanceRestError("local_position_notional_invalid", 0, undefined, "position_notional_invalid", "/local/safety");
    total = decimalAdd(total, decimalAbs(position.notional));
  }
  return total;
}

function hasOpenPositionForSymbol(positions: readonly BinancePositionRisk[], symbol: string): boolean {
  for (const position of positions) {
    if (position.symbol.toUpperCase() !== symbol.toUpperCase()) continue;
    if (!/^-?\d+(\.\d+)?$/.test(position.positionAmt)) {
      throw new BinanceRestError("local_position_amount_invalid", 0, undefined, "position_amount_invalid", "/local/safety");
    }
    if (decimalCompare(decimalAbs(position.positionAmt), "0") > 0) return true;
  }
  return false;
}

function isProductionEndpoint(url: string): boolean {
  return url.replace(/\/+$/, "") === BINANCE_FUTURES_PRODUCTION_REST_URL;
}

function safeIntendedNotional(event: RuntimeEvent): string | undefined {
  const quantity = event.payload.quantity;
  const price = event.payload.limitPrice ?? event.payload.price ?? event.payload.markPrice;
  if ((typeof quantity !== "string" && typeof quantity !== "number") || (typeof price !== "string" && typeof price !== "number")) {
    return undefined;
  }
  const quantityText = String(quantity);
  const priceText = String(price);
  if (!/^\d+(\.\d+)?$/.test(quantityText) || !/^\d+(\.\d+)?$/.test(priceText)) return undefined;
  return decimalMultiply(quantityText, priceText);
}

function utcDay(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
