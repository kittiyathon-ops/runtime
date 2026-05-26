import type { EventInput } from "../core/event.js";

export type MarketDataAdapterLifecycleAction =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "stale_stream_detected";

export interface MarketDataAdapterLifecycleEvent {
  adapterId: string;
  action: MarketDataAdapterLifecycleAction;
  symbol: string;
  stream?: string;
  reason?: string;
}

export type CanonicalMarketEventSink = (event: EventInput) => Promise<void> | void;
export type MarketDataLifecycleSink = (event: MarketDataAdapterLifecycleEvent) => Promise<void> | void;

export interface RuntimeMarketDataAdapter {
  readonly id: string;
  start(sink: CanonicalMarketEventSink, lifecycleSink: MarketDataLifecycleSink): Promise<void> | void;
  stop(): Promise<void> | void;
}

export function assertAdapterNeutralMarketEvent(event: EventInput): void {
  if (event.source !== "market_data_adapter") {
    throw new Error("external_market_event_source_invalid");
  }
  if (event.eventType !== "MARKET_TICK" && event.eventType !== "BOOK_UPDATE") {
    throw new Error("external_market_event_type_invalid");
  }
  if ("stream" in event.payload) {
    throw new Error("external_market_event_payload_not_adapter_neutral");
  }
}
