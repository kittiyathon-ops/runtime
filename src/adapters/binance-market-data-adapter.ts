import type { EventInput } from "../core/event.js";
import type { Clock } from "../core/clock.js";
import type { RuntimeConfig } from "../infra/config.js";
import type { Logger } from "../infra/logger.js";
import {
  BinanceMarketStream,
  type BinanceMarketStreamKind,
  normalizeBinanceMarketPayload
} from "./binance.js";
import type {
  CanonicalMarketEventSink,
  MarketDataAdapterLifecycleEvent,
  MarketDataLifecycleSink,
  RuntimeMarketDataAdapter
} from "../runtime/market-data-adapter.js";

export class BinanceMarketDataAdapter implements RuntimeMarketDataAdapter {
  readonly id: string;
  private stream: BinanceMarketStream | undefined;

  constructor(
    private readonly symbol: string,
    private readonly config: Pick<RuntimeConfig, "binanceFuturesMarketWsBaseUrl" | "staleDataHaltMs">,
    private readonly clock: Clock,
    private readonly logger: Logger
  ) {
    this.id = `binance-market-data:${symbol.toUpperCase()}`;
  }

  start(sink: CanonicalMarketEventSink, lifecycleSink: MarketDataLifecycleSink): void {
    const stream = new BinanceMarketStream(
      this.config,
      this.clock,
      this.logger,
      async (event) => {
        await sink(toAdapterNeutralMarketEvent(event, this.id));
      },
      (event) => lifecycleSink(toAdapterLifecycleEvent(this.id, event))
    );
    stream.connectBookTicker(this.symbol);
    stream.connectTrades(this.symbol);
    stream.connectMarkPrice(this.symbol);
    this.stream = stream;
  }

  stop(): void {
    this.stream?.close();
    this.stream = undefined;
  }
}

export function normalizeBinanceMarketPayloadForAdapter(
  stream: BinanceMarketStreamKind,
  symbol: string,
  payload: Record<string, unknown>,
  receiveTimestamp: number
): EventInput {
  return toAdapterNeutralMarketEvent(
    normalizeBinanceMarketPayload(stream, symbol, payload, receiveTimestamp),
    `binance-market-data:${symbol.toUpperCase()}`
  );
}

function toAdapterNeutralMarketEvent(event: EventInput, adapterId: string): EventInput {
  const { stream: rawStream, ...payload } = event.payload;
  const stream = isBinanceMarketStreamKind(rawStream) ? rawStream : undefined;
  return {
    ...event,
    source: "market_data_adapter",
    causationId: adapterId,
    payload: {
      ...payload,
      marketDataKind: marketDataKind(stream)
    }
  };
}

function toAdapterLifecycleEvent(
  adapterId: string,
  event: {
    action: MarketDataAdapterLifecycleEvent["action"];
    symbol: string;
    stream: BinanceMarketStreamKind;
    reason?: string;
  }
): MarketDataAdapterLifecycleEvent {
  return {
    adapterId,
    action: event.action,
    symbol: event.symbol,
    stream: marketDataKind(event.stream),
    ...(event.reason === undefined ? {} : { reason: event.reason })
  };
}

function isBinanceMarketStreamKind(value: unknown): value is BinanceMarketStreamKind {
  return value === "bookTicker" || value === "trade" || value === "markPrice";
}

function marketDataKind(stream: BinanceMarketStreamKind | undefined): string {
  if (stream === "bookTicker") return "order_book";
  if (stream === "trade") return "trade";
  if (stream === "markPrice") return "mark_price";
  return "unknown";
}
