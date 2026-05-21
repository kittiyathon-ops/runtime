import type { EventInput } from "../../core/event.js";

export type BinanceStreamKind = "bookTicker" | "trade" | "markPrice";

export interface ExchangeEventNormalizer<TRaw> {
  normalize(raw: TRaw, receivedAt: number): EventInput;
}

function numberLike(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new Error(`binance_payload_invalid:${field}`);
  return parsed;
}

export class BinanceEventNormalizer implements ExchangeEventNormalizer<Record<string, unknown>> {
  constructor(private readonly stream: BinanceStreamKind, private readonly symbol: string) {}

  normalize(raw: Record<string, unknown>, receivedAt: number): EventInput {
    const symbol = this.symbol.toUpperCase();
    if (this.stream === "bookTicker") {
      const updateId = numberLike(raw.u, "u");
      return {
        eventId: `binance:bookTicker:${symbol}:${updateId}`,
        timestamp: receivedAt,
        receiveTimestamp: receivedAt,
        processingTimestamp: receivedAt,
        source: "binance_market_ws",
        symbol,
        eventType: "BOOK_UPDATE",
        correlationId: `binance:${symbol}`,
        causationId: "exchange",
        payload: {
          stream: this.stream,
          updateId,
          bidPrice: numberLike(raw.b, "b"),
          bidQuantity: numberLike(raw.B, "B"),
          askPrice: numberLike(raw.a, "a"),
          askQuantity: numberLike(raw.A, "A")
        }
      };
    }

    if (this.stream === "trade") {
      const tradeId = numberLike(raw.t, "t");
      return {
        eventId: `binance:trade:${symbol}:${tradeId}`,
        timestamp: receivedAt,
        receiveTimestamp: receivedAt,
        processingTimestamp: receivedAt,
        source: "binance_market_ws",
        symbol,
        eventType: "MARKET_TICK",
        correlationId: `binance:${symbol}`,
        causationId: "exchange",
        payload: {
          stream: this.stream,
          tradeId,
          price: numberLike(raw.p, "p"),
          quantity: numberLike(raw.q, "q"),
          buyerIsMaker: raw.m === true
        }
      };
    }

    return {
      eventId: `binance:markPrice:${symbol}:${String(raw.E ?? receivedAt)}`,
      timestamp: receivedAt,
      receiveTimestamp: receivedAt,
      processingTimestamp: receivedAt,
      source: "binance_market_ws",
      symbol,
      eventType: "MARKET_TICK",
      correlationId: `binance:${symbol}`,
      causationId: "exchange",
      payload: {
        stream: this.stream,
        markPrice: numberLike(raw.p, "p"),
        indexPrice: numberLike(raw.i, "i"),
        fundingRate: numberLike(raw.r, "r")
      }
    };
  }
}
