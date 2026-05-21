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

