import WebSocket from "ws";
import type { EventInput } from "../core/event.js";
import { rootCorrelationId } from "../core/ids.js";
import type { Clock } from "../core/clock.js";
import type { RuntimeConfig } from "../infra/config.js";
import type { Logger } from "../infra/logger.js";

export type BinanceMarketStreamKind = "bookTicker" | "trade" | "markPrice";
export type NormalizedEventSink = (event: EventInput) => Promise<void>;
export type MarketStreamLifecycle =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "stale_stream_detected";
export type LifecycleSink = (event: {
  action: MarketStreamLifecycle;
  symbol: string;
  stream: BinanceMarketStreamKind;
  reason?: string;
}) => Promise<void> | void;

type WebSocketLike = {
  on(event: "open" | "close" | "error" | "message", listener: (...args: unknown[]) => void): WebSocketLike;
  close(): void;
};

type WebSocketFactory = (url: string) => WebSocketLike;

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`malformed_exchange_payload:${key}`);
  }
  return value;
}

function requireNumberLike(payload: Record<string, unknown>, key: string): number {
  const value = payload[key];
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) {
    throw new Error(`malformed_exchange_payload:${key}`);
  }
  return number;
}

function optionalTimestamp(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`malformed_exchange_payload:${key}`);
  }
  return value;
}

function eventIdFor(stream: BinanceMarketStreamKind, symbol: string, payload: Record<string, unknown>): string {
  if (stream === "bookTicker") {
    return `binance:${stream}:${symbol}:${String(payload.u)}`;
  }
  if (stream === "trade") {
    return `binance:${stream}:${symbol}:${String(payload.t)}`;
  }
  return `binance:${stream}:${symbol}:${String(payload.E)}`;
}

export function normalizeBinanceMarketPayload(
  stream: BinanceMarketStreamKind,
  symbol: string,
  payload: Record<string, unknown>,
  receiveTimestamp: number,
  correlationId = rootCorrelationId()
): EventInput {
  const normalizedSymbol = symbol.toUpperCase();
  if (stream === "bookTicker") {
    return {
      eventId: eventIdFor(stream, normalizedSymbol, payload),
      timestamp: receiveTimestamp,
      receiveTimestamp,
      processingTimestamp: receiveTimestamp,
      exchangeTimestamp: optionalTimestamp(payload, "E"),
      source: "binance_market_ws",
      symbol: normalizedSymbol,
      eventType: "BOOK_UPDATE",
      correlationId,
      causationId: "exchange",
      payload: {
        stream,
        updateId: requireNumberLike(payload, "u"),
        bidPrice: requireNumberLike(payload, "b"),
        bidQuantity: requireNumberLike(payload, "B"),
        askPrice: requireNumberLike(payload, "a"),
        askQuantity: requireNumberLike(payload, "A")
      }
    };
  }

  if (stream === "trade") {
    const tradeTime = optionalTimestamp(payload, "T");
    return {
      eventId: eventIdFor(stream, normalizedSymbol, payload),
      timestamp: receiveTimestamp,
      receiveTimestamp,
      processingTimestamp: receiveTimestamp,
      exchangeTimestamp: tradeTime ?? optionalTimestamp(payload, "E"),
      source: "binance_market_ws",
      symbol: normalizedSymbol,
      eventType: "MARKET_TICK",
      correlationId,
      causationId: "exchange",
      payload: {
        stream,
        tradeId: requireNumberLike(payload, "t"),
        price: requireNumberLike(payload, "p"),
        quantity: requireNumberLike(payload, "q"),
        buyerIsMaker: payload.m === true
      }
    };
  }

  requireString(payload, "s");
  return {
    eventId: eventIdFor(stream, normalizedSymbol, payload),
    timestamp: receiveTimestamp,
    receiveTimestamp,
    processingTimestamp: receiveTimestamp,
    exchangeTimestamp: optionalTimestamp(payload, "E"),
    source: "binance_market_ws",
    symbol: normalizedSymbol,
    eventType: "MARKET_TICK",
    correlationId,
    causationId: "exchange",
    payload: {
      stream,
      markPrice: requireNumberLike(payload, "p"),
      indexPrice: requireNumberLike(payload, "i"),
      estimatedSettlePrice: requireNumberLike(payload, "P"),
      fundingRate: requireNumberLike(payload, "r"),
      nextFundingTime: optionalTimestamp(payload, "T")
    }
  };
}

export class BinanceMarketStream {
  private readonly sockets: WebSocketLike[] = [];
  private closed = false;
  private readonly staleTimers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly config: Pick<RuntimeConfig, "binanceFuturesWsUrl" | "staleDataHaltMs">,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly sink: NormalizedEventSink,
    private readonly lifecycleSink: LifecycleSink,
    private readonly websocketFactory: WebSocketFactory = (url) => new WebSocket(url)
  ) {}

  connectBookTicker(symbol: string): void {
    this.connect(symbol, "bookTicker");
  }

  connectTrades(symbol: string): void {
    this.connect(symbol, "trade");
  }

  connectMarkPrice(symbol: string): void {
    this.connect(symbol, "markPrice");
  }

  connect(symbol: string, stream: BinanceMarketStreamKind): void {
    const streamName = this.toStreamName(symbol, stream);
    const url = `${this.config.binanceFuturesWsUrl}/ws/${streamName}`;
    let lastMessageAt = this.clock.nowMs();
    const socket = this.websocketFactory(url);
    this.sockets.push(socket);
    socket.on("open", () => {
      void this.lifecycleSink({ action: "connected", symbol: symbol.toUpperCase(), stream });
    });
    socket.on("message", (raw) => {
      lastMessageAt = this.clock.nowMs();
      void this.onMessage(symbol.toUpperCase(), stream, String(raw));
    });
    socket.on("close", () => {
      if (!this.closed) {
        this.logger.warn({ symbol, stream }, "binance_market_stream_closed");
        void this.lifecycleSink({ action: "disconnected", symbol: symbol.toUpperCase(), stream, reason: "websocket_disconnect" });
        void this.lifecycleSink({ action: "reconnecting", symbol: symbol.toUpperCase(), stream, reason: "websocket_disconnect" });
      }
    });
    socket.on("error", (error) => {
      this.logger.error({ error, symbol, stream }, "binance_market_stream_error");
    });

    const staleTimer = setInterval(() => {
      if (this.closed) return;
      if (this.clock.nowMs() - lastMessageAt <= this.config.staleDataHaltMs) return;
      void this.lifecycleSink({
        action: "stale_stream_detected",
        symbol: symbol.toUpperCase(),
        stream,
        reason: "stale_market_stream"
      });
    }, this.config.staleDataHaltMs);
    this.staleTimers.add(staleTimer);
  }

  close(): void {
    this.closed = true;
    for (const timer of this.staleTimers) {
      clearInterval(timer);
    }
    this.staleTimers.clear();
    for (const socket of this.sockets) {
      socket.close();
    }
    this.sockets.length = 0;
  }

  private async onMessage(symbol: string, stream: BinanceMarketStreamKind, raw: string): Promise<void> {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("malformed_exchange_payload:json");
      }
      await this.sink(normalizeBinanceMarketPayload(stream, symbol, parsed as Record<string, unknown>, this.clock.nowMs()));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "malformed_exchange_payload";
      await this.lifecycleSink({ action: "stale_stream_detected", symbol, stream, reason });
    }
  }

  private toStreamName(symbol: string, stream: BinanceMarketStreamKind): string {
    const normalizedSymbol = symbol.toLowerCase();
    if (stream === "bookTicker") return `${normalizedSymbol}@bookTicker`;
    if (stream === "trade") return `${normalizedSymbol}@trade`;
    return `${normalizedSymbol}@markPrice@1s`;
  }
}
