import type { RuntimeEvent } from "../core/event.js";

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  unrealizedPnl: number;
}

export interface PortfolioSnapshot {
  positions: Record<string, Position>;
  realizedPnl: number;
  equityUsd: number;
}

export class PortfolioState {
  private readonly positions = new Map<string, Position>();
  private realizedPnl = 0;
  private equityUsd = 0;

  apply(event: RuntimeEvent): void {
    if (event.eventType !== "ORDER_FILLED" && event.eventType !== "POSITION_UPDATED") return;
    const symbol = event.symbol;
    const quantity = Number(event.payload.quantity ?? 0);
    const price = Number(event.payload.price ?? 0);
    const unrealizedPnl = Number(event.payload.unrealizedPnl ?? 0);
    if (!Number.isFinite(quantity) || !Number.isFinite(price)) return;
    this.positions.set(symbol, {
      symbol,
      quantity,
      averagePrice: price,
      unrealizedPnl
    });
  }

  exposureUsd(): number {
    let exposure = 0;
    for (const position of this.positions.values()) {
      exposure += Math.abs(position.quantity * position.averagePrice);
    }
    return exposure;
  }

  snapshot(): PortfolioSnapshot {
    return {
      positions: Object.fromEntries(this.positions.entries()),
      realizedPnl: this.realizedPnl,
      equityUsd: this.equityUsd
    };
  }
}
