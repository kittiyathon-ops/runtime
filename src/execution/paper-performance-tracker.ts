import type { RuntimeEvent } from "../core/event.js";

export interface PaperPerformancePosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  exposureUsd: number;
}

export interface PaperPerformanceSnapshot {
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  grossProfitUsd: number;
  grossLossUsd: number;
  maxDrawdownUsd: number;
  currentExposureUsd: number;
  averageFillPrice: number;
  positions: Record<string, PaperPerformancePosition>;
}

type MutablePosition = {
  symbol: string;
  quantity: number;
  averagePrice: number;
};

export class PaperPerformanceTracker {
  private readonly positions = new Map<string, MutablePosition>();
  private realizedPnlUsd = 0;
  private unrealizedPnlUsd = 0;
  private totalTrades = 0;
  private winningTrades = 0;
  private losingTrades = 0;
  private grossProfitUsd = 0;
  private grossLossUsd = 0;
  private maxDrawdownUsd = 0;
  private peakEquityUsd = 0;
  private fillNotionalUsd = 0;
  private fillQuantity = 0;

  apply(event: RuntimeEvent): PaperPerformanceSnapshot {
    if (event.eventType !== "ORDER_FILLED" || event.payload.simulator !== "paper_fill") {
      return this.snapshot();
    }

    const fillQuantity = Number(event.payload.quantity);
    const fillPrice = Number(event.payload.price);
    if (!Number.isFinite(fillQuantity) || fillQuantity === 0 || !Number.isFinite(fillPrice) || fillPrice <= 0) {
      return this.snapshot();
    }

    this.fillNotionalUsd += Math.abs(fillQuantity * fillPrice);
    this.fillQuantity += Math.abs(fillQuantity);

    const previous = this.positions.get(event.symbol) ?? {
      symbol: event.symbol,
      quantity: 0,
      averagePrice: 0
    };
    const realized = this.applyFill(previous, fillQuantity, fillPrice);
    this.positions.set(event.symbol, previous);

    if (realized !== 0) {
      this.totalTrades += 1;
      if (realized > 0) {
        this.winningTrades += 1;
        this.grossProfitUsd += realized;
      } else {
        this.losingTrades += 1;
        this.grossLossUsd += Math.abs(realized);
      }
      this.realizedPnlUsd += realized;
    }

    this.unrealizedPnlUsd = this.unrealizedPnlAt(event.symbol, fillPrice);
    const equity = this.realizedPnlUsd + this.unrealizedPnlUsd;
    this.peakEquityUsd = Math.max(this.peakEquityUsd, equity);
    this.maxDrawdownUsd = Math.max(this.maxDrawdownUsd, this.peakEquityUsd - equity);

    return this.snapshot();
  }

  snapshot(): PaperPerformanceSnapshot {
    const positions = Object.fromEntries(
      Array.from(this.positions.entries()).map(([symbol, position]) => [
        symbol,
        {
          symbol,
          quantity: position.quantity,
          averagePrice: position.averagePrice,
          exposureUsd: Math.abs(position.quantity * position.averagePrice)
        }
      ])
    );
    const currentExposureUsd = Object.values(positions).reduce((sum, position) => sum + position.exposureUsd, 0);
    return {
      realizedPnlUsd: this.realizedPnlUsd,
      unrealizedPnlUsd: this.unrealizedPnlUsd,
      totalTrades: this.totalTrades,
      winningTrades: this.winningTrades,
      losingTrades: this.losingTrades,
      winRate: this.totalTrades === 0 ? 0 : this.winningTrades / this.totalTrades,
      grossProfitUsd: this.grossProfitUsd,
      grossLossUsd: this.grossLossUsd,
      maxDrawdownUsd: this.maxDrawdownUsd,
      currentExposureUsd,
      averageFillPrice: this.fillQuantity === 0 ? 0 : this.fillNotionalUsd / this.fillQuantity,
      positions
    };
  }

  static replay(events: RuntimeEvent[]): PaperPerformanceSnapshot {
    const tracker = new PaperPerformanceTracker();
    for (const event of events) {
      tracker.apply(event);
    }
    return tracker.snapshot();
  }

  private applyFill(position: MutablePosition, fillQuantity: number, fillPrice: number): number {
    if (position.quantity === 0 || Math.sign(position.quantity) === Math.sign(fillQuantity)) {
      const nextQuantity = position.quantity + fillQuantity;
      position.averagePrice = nextQuantity === 0
        ? 0
        : ((Math.abs(position.quantity) * position.averagePrice) + (Math.abs(fillQuantity) * fillPrice)) / Math.abs(nextQuantity);
      position.quantity = nextQuantity;
      return 0;
    }

    const closedQuantity = Math.min(Math.abs(position.quantity), Math.abs(fillQuantity));
    const realized = closedQuantity * (fillPrice - position.averagePrice) * Math.sign(position.quantity);
    const nextQuantity = position.quantity + fillQuantity;
    if (nextQuantity === 0) {
      position.quantity = 0;
      position.averagePrice = 0;
      return realized;
    }
    if (Math.sign(nextQuantity) === Math.sign(position.quantity)) {
      position.quantity = nextQuantity;
      return realized;
    }

    position.quantity = nextQuantity;
    position.averagePrice = fillPrice;
    return realized;
  }

  private unrealizedPnlAt(symbol: string, price: number): number {
    let unrealized = 0;
    for (const position of this.positions.values()) {
      const markPrice = position.symbol === symbol ? price : position.averagePrice;
      unrealized += (markPrice - position.averagePrice) * position.quantity;
    }
    return unrealized;
  }
}
