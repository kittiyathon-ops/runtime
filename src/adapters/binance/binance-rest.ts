import { createHmac } from "node:crypto";
import { ExchangePayloadGuard } from "../../bridge/ExchangePayloadGuard.js";

export const BINANCE_FUTURES_PRODUCTION_REST_URL = "https://fapi.binance.com";
export const BINANCE_FUTURES_TESTNET_REST_URL = "https://demo-fapi.binance.com";

export type BinanceHttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type BinanceRequestValue = string | number | boolean | null | undefined;
export type BinanceRequestParams = Record<string, BinanceRequestValue>;
export type BinanceFetch = typeof fetch;

export interface BinanceSignedQuery {
  queryWithoutSignature: string;
  signature: string;
  signedQuery: string;
}

export interface BinanceRestConfig {
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  useTestnet?: boolean;
  recvWindow?: number;
  fetchImpl?: BinanceFetch;
}

export interface RestHealth {
  available: boolean;
  reason?: string;
}

export interface BinanceRateLimitSnapshot {
  usedWeight1m: number;
  orderCount10s: number;
  orderCount1m: number;
}

export interface BinanceOrderRequest {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: string;
  price?: string;
  timeInForce?: "GTC" | "IOC" | "FOK" | "GTX";
  reduceOnly?: boolean;
  newClientOrderId: string;
}

export interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  transactTime?: number;
  updateTime?: number;
  status: string;
  executedQty?: string;
  origQty?: string;
  price?: string;
  avgPrice?: string;
  side?: string;
  type?: string;
}

export interface BinanceOpenOrder {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  status: string;
  type: string;
  side: string;
}

export interface BinancePositionRisk {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  notional: string;
  leverage: string;
  unrealizedProfit: string;
}

export interface BinanceAccountBalance {
  accountAlias?: string;
  asset: string;
  balance: string;
  crossWalletBalance?: string;
  availableBalance?: string;
  updateTime?: number;
}

export interface BinanceExchangeFilter {
  filterType: string;
  minPrice?: string;
  maxPrice?: string;
  tickSize?: string;
  stepSize?: string;
  minQty?: string;
  maxQty?: string;
  minNotional?: string;
  notional?: string;
}

export interface BinanceExchangeSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: BinanceExchangeFilter[];
}

export interface BinanceExchangeInfo {
  serverTime?: number;
  symbols: BinanceExchangeSymbol[];
}

export class BinanceRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | undefined,
    readonly msg: string,
    readonly endpoint: string
  ) {
    super(message);
    this.name = "BinanceRestError";
  }
}

export class BinanceRest {
  private readonly resolvedBaseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly recvWindow: number;
  private readonly fetchImpl: BinanceFetch;
  private readonly rateLimits: BinanceRateLimitSnapshot = {
    usedWeight1m: 0,
    orderCount10s: 0,
    orderCount1m: 0
  };
  private lastObservedServerTime: number | undefined;
  private serverTimeOffsetMs: number | undefined;
  private serverTimeStatus: "UNOBSERVED" | "OBSERVED" | "UNAVAILABLE_LOCAL_CLOCK_SIGNING" = "UNOBSERVED";
  private readonly payloadGuard = new ExchangePayloadGuard({ maxBytes: 1024 * 1024 });

  constructor(private readonly config: BinanceRestConfig = {}) {
    this.resolvedBaseUrl = (config.baseUrl ?? (config.useTestnet === false ? BINANCE_FUTURES_PRODUCTION_REST_URL : BINANCE_FUTURES_TESTNET_REST_URL)).replace(/\/+$/, "");
    if (this.resolvedBaseUrl.length === 0) throw new Error("binance_rest_base_url_required");
    this.apiKey = (config.apiKey ?? "").trim();
    this.apiSecret = (config.apiSecret ?? "").trim();
    this.recvWindow = config.recvWindow ?? 5_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  health(): RestHealth {
    return { available: true };
  }

  baseUrl(): string {
    return this.resolvedBaseUrl;
  }

  rateLimitSnapshot(): BinanceRateLimitSnapshot {
    return { ...this.rateLimits };
  }

  signingClockStatus(): string {
    return this.serverTimeStatus;
  }

  signQuery(query: string): string {
    if (this.apiSecret.length === 0) throw new Error("binance_api_secret_required");
    return createHmac("sha256", this.apiSecret.trim()).update(query).digest("hex");
  }

  buildQuery(params: BinanceRequestParams): string {
    return Object.entries(params)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join("&");
  }

  buildSignedQuery(params: Record<string, string | number | boolean | null | undefined>): BinanceSignedQuery {
    const signedParams: BinanceRequestParams = { ...params };
    if (signedParams.recvWindow === undefined || signedParams.recvWindow === null) signedParams.recvWindow = this.recvWindow;
    if (signedParams.timestamp === undefined || signedParams.timestamp === null) signedParams.timestamp = this.currentTimestamp();

    const queryWithoutSignature = this.buildQuery(signedParams);
    const signature = this.signQuery(queryWithoutSignature);
    return {
      queryWithoutSignature,
      signature,
      signedQuery: `${queryWithoutSignature}&signature=${signature}`
    };
  }

  async publicRequest<T>(method: BinanceHttpMethod, endpoint: string, params: BinanceRequestParams = {}): Promise<T> {
    return this.request<T>(method, endpoint, params, false);
  }

  async signedRequest<T>(method: BinanceHttpMethod, endpoint: string, params: BinanceRequestParams = {}): Promise<T> {
    if (this.apiKey.length === 0) throw new Error("binance_api_key_required");
    if (this.apiSecret.length === 0) throw new Error("binance_api_secret_required");
    await this.ensureServerTimeOffset();
    const signedQuery = this.buildSignedQuery(params);
    this.debugSigning(method, endpoint, signedQuery.queryWithoutSignature);
    return this.request<T>(method, endpoint, {}, true, signedQuery.signedQuery);
  }

  async serverTime(): Promise<{ serverTime: number }> {
    const response = await this.publicRequest<{ serverTime: number }>("GET", "/fapi/v1/time");
    if (Number.isFinite(response.serverTime)) this.observeServerTime(response.serverTime);
    return response;
  }

  async newOrder(order: BinanceOrderRequest): Promise<BinanceOrderResponse> {
    return this.signedRequest("POST", "/fapi/v1/order", order as unknown as BinanceRequestParams);
  }

  async cancelOrder(symbol: string, orderId: number | string): Promise<BinanceOrderResponse> {
    return this.signedRequest("DELETE", "/fapi/v1/order", { symbol, orderId });
  }

  async cancelAllOpenOrders(symbol: string): Promise<{ code: number; msg: string }> {
    return this.signedRequest("DELETE", "/fapi/v1/allOpenOrders", { symbol });
  }

  async openOrders(symbol?: string): Promise<BinanceOpenOrder[]> {
    return this.signedRequest("GET", "/fapi/v1/openOrders", { symbol });
  }

  async positionRisk(symbol?: string): Promise<BinancePositionRisk[]> {
    return this.signedRequest("GET", "/fapi/v2/positionRisk", { symbol });
  }

  async accountBalance(): Promise<BinanceAccountBalance[]> {
    return this.signedRequest("GET", "/fapi/v2/balance");
  }

  async exchangeInfo(): Promise<BinanceExchangeInfo> {
    return this.publicRequest("GET", "/fapi/v1/exchangeInfo");
  }

  async createListenKey(): Promise<{ listenKey: string }> {
    return this.request("POST", "/fapi/v1/listenKey", {}, true);
  }

  async keepaliveListenKey(listenKey: string): Promise<Record<string, never>> {
    return this.request("PUT", "/fapi/v1/listenKey", { listenKey }, true);
  }

  async closeListenKey(listenKey: string): Promise<Record<string, never>> {
    return this.request("DELETE", "/fapi/v1/listenKey", { listenKey }, true);
  }

  private async request<T>(method: BinanceHttpMethod, endpoint: string, params: BinanceRequestParams, authenticated: boolean, queryOverride?: string): Promise<T> {
    const query = queryOverride ?? this.buildQuery(params);
    const url = method === "GET" || method === "DELETE" || queryOverride !== undefined
      ? `${this.resolvedBaseUrl}${endpoint}${query.length === 0 ? "" : `?${query}`}`
      : `${this.resolvedBaseUrl}${endpoint}`;
    const body = queryOverride === undefined && (method === "POST" || method === "PUT") && query.length > 0 ? query : undefined;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        ...(authenticated ? { "X-MBX-APIKEY": this.apiKey } : {}),
        ...(body === undefined ? {} : { "content-type": "application/x-www-form-urlencoded" })
      },
      ...(body === undefined ? {} : { body })
    });
    this.observeRateLimits(response.headers);
    const text = await response.text();
    const parsed = this.parseBody(text);
    if (!response.ok) {
      const errorBody = typeof parsed === "object" && parsed !== null ? parsed as { code?: unknown; msg?: unknown } : {};
      const code = typeof errorBody.code === "number" ? errorBody.code : undefined;
      const msg = typeof errorBody.msg === "string" ? errorBody.msg : response.statusText;
      if (code === -1022) {
        throw new BinanceRestError(
          "BINANCE_SIGNATURE_INVALID: possible causes: bad secret; wrong key/secret pair; hidden whitespace in env; wrong HMAC payload construction; mixed query/body signing; system clock drift",
          response.status,
          code,
          "BINANCE_SIGNATURE_INVALID",
          endpoint
        );
      }
      throw new BinanceRestError(`binance_rest_error:${response.status}:${code ?? "unknown"}`, response.status, code, msg, endpoint);
    }
    return parsed as T;
  }

  private debugSigning(method: BinanceHttpMethod, endpoint: string, queryWithoutSignature: string): void {
    if (process.env.BINANCE_SIGNING_DEBUG !== "true") return;
    const params = new URLSearchParams(queryWithoutSignature);
    const timestamp = Number(params.get("timestamp"));
    const diagnostic: {
      endpoint: string;
      method: BinanceHttpMethod;
      paramNames: string[];
      queryLength: number;
      signingClockStatus: string;
      timestampDeltaMs?: number;
    } = {
      endpoint,
      method,
      paramNames: [...params.keys()],
      queryLength: queryWithoutSignature.length,
      signingClockStatus: this.serverTimeStatus
    };
    if (Number.isFinite(timestamp) && this.serverTimeOffsetMs !== undefined) {
      diagnostic.timestampDeltaMs = this.currentTimestamp() - timestamp;
    }
    console.error(JSON.stringify({ event: "BINANCE_SIGNING_DEBUG", ...diagnostic }));
  }

  private observeServerTime(serverTime: number): void {
    this.lastObservedServerTime = serverTime;
    this.serverTimeOffsetMs = serverTime - Date.now();
    this.serverTimeStatus = "OBSERVED";
  }

  private async ensureServerTimeOffset(): Promise<void> {
    if (this.serverTimeOffsetMs !== undefined) return;
    try {
      await this.serverTime();
    } catch {
      this.serverTimeStatus = "UNAVAILABLE_LOCAL_CLOCK_SIGNING";
    }
  }

  private currentTimestamp(): number {
    return Date.now() + (this.serverTimeOffsetMs ?? 0);
  }

  private parseBody(text: string): unknown {
    if (text.length === 0) return {};
    return this.payloadGuard.parseJson(text);
  }

  private observeRateLimits(headers: Headers): void {
    this.rateLimits.usedWeight1m = this.headerNumber(headers, "x-mbx-used-weight-1m", this.rateLimits.usedWeight1m);
    this.rateLimits.orderCount10s = this.headerNumber(headers, "x-mbx-order-count-10s", this.rateLimits.orderCount10s);
    this.rateLimits.orderCount1m = this.headerNumber(headers, "x-mbx-order-count-1m", this.rateLimits.orderCount1m);
  }

  private headerNumber(headers: Headers, key: string, fallback: number): number {
    const value = headers.get(key);
    if (value === null) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
}
