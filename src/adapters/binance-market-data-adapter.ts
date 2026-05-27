/**
 * Binance Market Data Adapter
 *
 * Translates Binance exchange payloads into adapter-neutral EventInput before
 * they cross the runtime boundary (market-data-adapter.ts contract).
 *
 * Responsibilities:
 * - Connect Binance websocket streams per symbol
 * - Normalize raw Binance payloads into canonical, adapter-neutral EventInput
 * - Emit lifecycle events for connection state changes
 * - Strip all Binance-specific payload fields (stream, bookTicker, etc.)
 *
 * Must NOT:
 * - Leak Binance-specific payload fields into EventInput
 * - Contain strategy or risk logic
 * - Mutate runtime state directly
 *
 * Adapter-neutrality: output events use `source: "market_data_adapter"` and
 * `marketDataKind` instead of Binance's `stream` field, so runtime core
 * remains exchange-agnostic.
 *
 * Replay: events produced here are deterministic given the same raw input.
 * The `normalizeBinanceMarketPayloadForAdapter` function is pure and testable
 * in isolation without a live connection.
 */

import type { EventInput } from "../core/event.js";
import type { Clock } from "../core/clock.js";
import type { RuntimeConfig } from "../infra/config.js";
import type { Logger } from "../infra/logger.js";
import type { RuntimeMarketDataAdapter, MarketDataEventSink, MarketDataLifecycleSink } from "../runtime/market-data-adapter.js";
import {
  BinanceMarketStream,
  normalizeBinanceMarketPayload,
  type BinanceMarketStreamKind
} from "./binance.js";

// ─── Adapter-neutral market data kinds ───────────────────────────────────────

export type MarketDataKind = "order_book" | "trade" | "mark_price";

function streamToMarketDataKind(stream: BinanceMarketStreamKind): MarketDataKind {
  switch (stream) {
    case "bookTicker": return "order_book";
    case "trade":      return "trade";
    case "markPrice":  return "mark_price";
  }
}

// ─── Normalization (pure, testable) ──────────────────────────────────────────

/**
 * Normalize a raw Binance market payload into an adapter-neutral EventInput.
 *
 * Key differences from `normalizeBinanceMarketPayload`:
 * - `source` is `"market_data_adapter"` (not `"binance_market_ws"`)
 * - `stream` field is removed from payload
 * - `marketDataKind` replaces the Binance stream name
 *
 * Pure function — no side effects, no clock reads, deterministic.
 */
export function normalizeBinanceMarketPayloadForAdapter(
  stream: BinanceMarketStreamKind,
  symbol: string,
  payload: Record<string, unknown>,
  receiveTimestamp: number
): EventInput {
  // Delegate normalization to the existing canonical function
  const base = normalizeBinanceMarketPayload(stream, symbol, payload, receiveTimestamp);

  // Strip Binance-specific source and payload fields; inject adapter-neutral shape
  const { stream: _stripped, ...adapterPayload } = base.payload as Record<string, unknown> & { stream?: unknown };

  return {
    ...base,
    source: "market_data_adapter",
    payload: {
      ...adapterPayload,
      marketDataKind: streamToMarketDataKind(stream)
    }
  };
}

// ─── Adapter class ────────────────────────────────────────────────────────────

/**
 * BinanceMarketDataAdapter implements RuntimeMarketDataAdapter for Binance
 * USD-M Futures websocket streams.
 *
 * Connects bookTicker, trade, and markPrice streams for one symbol.
 * Normalizes each message into adapter-neutral EventInput via
 * `normalizeBinanceMarketPayloadForAdapter` before passing to the runtime sink.
 *
 * Lifecycle events map Binance stream states to the generic
 * MarketDataAdapterLifecycleEvent contract.
 */
export class BinanceMarketDataAdapter implements RuntimeMarketDataAdapter {
  readonly id: string;

  private stream: BinanceMarketStream | undefined;

  constructor(
    private readonly symbol: string,
    private readonly config: Pick<RuntimeConfig, "binanceFuturesMarketWsBaseUrl" | "staleDataHaltMs">,
    private readonly clock: Clock,
    private readonly logger: Logger
  ) {
    this.id = `binance-market-data-adapter:${symbol.toUpperCase()}`;
  }

  async start(sink: MarketDataEventSink, lifecycleSink: MarketDataLifecycleSink): Promise<void> {
    const normalizedSymbol = this.symbol.toUpperCase();

    // Wrap the canonical Binance sink to strip exchange-specific fields
    const adapterSink = async (event: EventInput): Promise<void> => {
      // Re-normalize through adapter to ensure neutrality even if BinanceMarketStream
      // later changes its output format. We read stream kind from the payload.
      await sink(this.toAdapterNeutral(event));
    };

    // Map Binance lifecycle events to adapter-neutral lifecycle events
    const binanceLifecycleSink = async (event: {
      action: string;
      symbol: string;
      stream: BinanceMarketStreamKind;
      reason?: string;
    }): Promise<void> => {
      await lifecycleSink({
        adapterId: this.id,
        action: event.action as "connected" | "disconnected" | "reconnecting" | "stale_stream_detected" | "recovered",
        symbol: event.symbol,
        stream: streamToMarketDataKind(event.stream),
        ...(event.reason !== undefined ? { reason: event.reason } : {})
      });
    };

    this.stream = new BinanceMarketStream(
      this.config,
      this.clock,
      this.logger,
      adapterSink,
      binanceLifecycleSink
    );

    this.stream.connectBookTicker(normalizedSymbol);
    this.stream.connectTrades(normalizedSymbol);
    this.stream.connectMarkPrice(normalizedSymbol);
  }

  stop(): void {
    this.stream?.close();
    this.stream = undefined;
  }

  /**
   * Convert a BinanceMarketStream output event into an adapter-neutral event.
   *
   * BinanceMarketStream already calls normalizeBinanceMarketPayload internally,
   * so we only need to strip `stream` and remap `source` + add `marketDataKind`.
   */
  private toAdapterNeutral(event: EventInput): EventInput {
    const payload = event.payload as Record<string, unknown>;
    const streamKind = payload.stream as BinanceMarketStreamKind | undefined;
    const { stream: _dropped, ...rest } = payload;

    return {
      ...event,
      source: "market_data_adapter",
      payload: {
        ...rest,
        ...(streamKind !== undefined ? { marketDataKind: streamToMarketDataKind(streamKind) } : {})
      }
    };
  }
}