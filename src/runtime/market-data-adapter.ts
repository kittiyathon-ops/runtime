/**
 * Market Data Adapter Boundary Contract
 *
 * This module defines the stable interface between external market data sources
 * and runtime core. It enforces adapter neutrality: runtime core must never
 * see Binance-specific payload fields (e.g. `stream`, `bookTicker`).
 *
 * Architectural principle: adapters translate exchange-specific payloads into
 * canonical EventInput before crossing this boundary. Runtime core consumes
 * only adapter-neutral events.
 *
 * Survivability implication: this boundary ensures that adding a second exchange
 * does not require modifying runtime.ts. The adapter owns protocol details;
 * the runtime owns execution logic.
 *
 * Replay implication: adapter-neutral events are deterministic regardless of
 * which exchange sourced them. Replay does not need to know about Binance.
 */

import type { EventInput } from "../core/event.js";

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/**
 * Actions an adapter can emit during its lifecycle.
 *
 * `connected`            — websocket/transport is up and delivering events
 * `disconnected`         — transport lost unexpectedly; triggers SAFE_MODE
 * `reconnecting`         — attempting to restore connection
 * `stale_stream_detected`— heartbeat/data has stopped flowing; triggers SAFE_MODE
 * `recovered`            — connection restored after disconnect/stale
 */
export type MarketDataAdapterLifecycleAction =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "stale_stream_detected"
  | "recovered";

export interface MarketDataAdapterLifecycleEvent {
  /** Unique adapter identifier for audit correlation */
  readonly adapterId: string;
  readonly action: MarketDataAdapterLifecycleAction;
  readonly symbol: string;
  /** Human-readable stream name (e.g. "order_book", "trade") — for audit only */
  readonly stream?: string;
  /** Machine-readable reason — used for SAFE_MODE causation */
  readonly reason?: string;
}

// ─── Sink types ──────────────────────────────────────────────────────────────

export type MarketDataEventSink = (event: EventInput) => Promise<void>;
export type MarketDataLifecycleSink = (event: MarketDataAdapterLifecycleEvent) => Promise<void>;

// ─── Adapter interface ───────────────────────────────────────────────────────

/**
 * RuntimeMarketDataAdapter is the stable interface all market data adapters
 * must implement. An adapter's only job is to translate external protocol
 * messages into adapter-neutral EventInput and emit lifecycle events.
 *
 * An adapter must NOT:
 * - mutate runtime state
 * - contain strategy logic
 * - leak exchange-specific payload structure through the sink
 * - submit orders
 */
export interface RuntimeMarketDataAdapter {
  /** Unique identifier for audit and deduplication */
  readonly id: string;

  /**
   * Start the adapter. When ready, the adapter calls `sink` for each
   * normalized market event and `lifecycleSink` for connection state changes.
   *
   * Must return only after initial connection setup is attempted.
   */
  start(
    sink: MarketDataEventSink,
    lifecycleSink: MarketDataLifecycleSink
  ): Promise<void>;

  /**
   * Stop the adapter gracefully. Must close transports and cancel timers.
   * Must not throw; errors should be logged internally.
   */
  stop(): Promise<void> | void;
}

// ─── Adapter-neutrality guard ─────────────────────────────────────────────────

/**
 * Forbidden payload fields that indicate Binance-specific leakage.
 *
 * If any of these appear in an event crossing the adapter boundary, the event
 * was not properly normalized. Fail closed: reject the event rather than
 * silently propagating exchange-specific structure into runtime core.
 */
const FORBIDDEN_PAYLOAD_FIELDS: ReadonlySet<string> = new Set([
  "stream",       // Binance stream name (bookTicker, trade, markPrice)
  "bookTicker",   // Binance stream type label
]);

/**
 * Assert that an EventInput crossing the adapter boundary is adapter-neutral.
 *
 * Runtime core calls this before accepting any external market event.
 * An event fails this check if:
 * - its source is `binance_market_ws` (Binance adapter must use `market_data_adapter`)
 * - its payload contains Binance-specific fields (e.g. `stream`)
 *
 * Throws: `external_market_event_payload_not_adapter_neutral:<reason>`
 *
 * Determinism: pure assertion, no clock reads, no async operations.
 * Replay: throwing here prevents corrupt events from entering the event store.
 */
export function assertAdapterNeutralMarketEvent(input: EventInput): void {
  // Source guard: Binance-internal source must not cross this boundary
  if (input.source === "binance_market_ws") {
    throw new Error(
      "external_market_event_payload_not_adapter_neutral:source_binance_market_ws_not_allowed"
    );
  }

  // Payload field guard: check for forbidden Binance-specific fields
  for (const field of FORBIDDEN_PAYLOAD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input.payload, field)) {
      throw new Error(
        `external_market_event_payload_not_adapter_neutral:forbidden_field_${field}`
      );
    }
  }
}