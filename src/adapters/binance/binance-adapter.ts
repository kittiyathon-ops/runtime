import type { EventInput } from "../../core/event.js";
import type { Clock } from "../../infra/clock.js";
import { BinanceEventNormalizer, type BinanceStreamKind } from "./binance-event-normalizer.js";
import { BinanceRest } from "./binance-rest.js";
import { BinanceWebsocket, type RuntimeEventSink, type WebsocketLifecycleSink } from "./binance-websocket.js";

export interface ExchangeAdapter {
  readonly exchange: string;
  connectMarketStream(symbol: string, stream: BinanceStreamKind, sink: RuntimeEventSink): Promise<void>;
  close(): void;
}

export interface BinanceAdapterConfig {
  websocketUrl: string;
  restBaseUrl: string;
  reconnect: boolean;
}

export class BinanceAdapter implements ExchangeAdapter {
  readonly exchange = "binance";
  private readonly sockets: BinanceWebsocket[] = [];
  private readonly rest: BinanceRest;

  constructor(
    private readonly config: BinanceAdapterConfig,
    private readonly clock: Clock,
    private readonly lifecycleSink: WebsocketLifecycleSink = () => undefined
  ) {
    this.rest = new BinanceRest({ baseUrl: config.restBaseUrl });
  }

  async connectMarketStream(symbol: string, stream: BinanceStreamKind, sink: (event: EventInput) => Promise<void> | void): Promise<void> {
    const socket = new BinanceWebsocket(
      { url: this.config.websocketUrl, reconnect: this.config.reconnect },
      this.clock,
      new BinanceEventNormalizer(stream, symbol),
      sink,
      this.lifecycleSink
    );
    this.sockets.push(socket);
    await socket.connect();
  }

  restHealth(): ReturnType<BinanceRest["health"]> {
    return this.rest.health();
  }

  close(): void {
    for (const socket of this.sockets) socket.close();
    this.sockets.length = 0;
  }
}
