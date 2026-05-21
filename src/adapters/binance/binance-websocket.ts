import type { EventInput } from "../../core/event.js";
import type { Clock } from "../../infra/clock.js";
import type { BinanceEventNormalizer } from "./binance-event-normalizer.js";

export type AdapterLifecycleState = "IDLE" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "DISCONNECTED" | "CLOSED";
export type RuntimeEventSink = (event: EventInput) => Promise<void> | void;

export interface WebsocketLifecycleEvent {
  state: AdapterLifecycleState;
  reason?: string;
  at: number;
}

export type WebsocketLifecycleSink = (event: WebsocketLifecycleEvent) => Promise<void> | void;

export interface BinanceWebsocketConfig {
  url: string;
  reconnect: boolean;
}

export class BinanceWebsocket {
  private state: AdapterLifecycleState = "IDLE";
  private deliveredIds = new Set<string>();

  constructor(
    private readonly config: BinanceWebsocketConfig,
    private readonly clock: Clock,
    private readonly normalizer: BinanceEventNormalizer,
    private readonly eventSink: RuntimeEventSink,
    private readonly lifecycleSink: WebsocketLifecycleSink = () => undefined
  ) {}

  lifecycleState(): AdapterLifecycleState {
    return this.state;
  }

  async connect(): Promise<void> {
    this.transition("CONNECTING");
    this.transition("CONNECTED");
  }

  async disconnect(reason = "disconnect"): Promise<void> {
    this.transition("DISCONNECTED", reason);
    if (this.config.reconnect) this.transition("RECONNECTING", reason);
  }

  close(): void {
    this.state = "CLOSED";
    void this.lifecycleSink({ state: "CLOSED", at: this.clock.now() });
  }

  async onRawMessage(raw: Record<string, unknown>): Promise<void> {
    if (this.state !== "CONNECTED") throw new Error("websocket_not_connected");
    const normalized = this.normalizer.normalize(raw, this.clock.now());
    if (normalized.eventId !== undefined && this.deliveredIds.has(normalized.eventId)) return;
    if (normalized.eventId !== undefined) this.deliveredIds.add(normalized.eventId);
    await this.eventSink(normalized);
  }

  private transition(state: AdapterLifecycleState, reason?: string): void {
    this.state = state;
    void this.lifecycleSink({
      state,
      ...(reason === undefined ? {} : { reason }),
      at: this.clock.now()
    });
  }
}
