import type { RuntimeEvent } from "../core/event.js";

export interface MarketSnapshot {
  symbol: string;
  bid: number;
  ask: number;
  timestamp: number;
}

export interface PaperFillSimulationResult {
  event: RuntimeEvent;
  slippageBps: number;
  notionalUsd: number;
}

export class PaperFillSimulator {
  constructor(private readonly slippageBps: number) {
    if (!Number.isFinite(slippageBps) || slippageBps < 0) {
      throw new Error("paper_fill_slippage_invalid");
    }
  }

  simulate(order: RuntimeEvent, snapshot: MarketSnapshot, nextSeq: () => number, nowMs: number): PaperFillSimulationResult | undefined {
    if (order.eventType !== "ORDER_SUBMITTED") return undefined;
    const side = order.payload.side === "SELL" ? "SELL" : "BUY";
    const quantity = Number(order.payload.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return undefined;

    const referencePrice = side === "BUY" ? snapshot.ask : snapshot.bid;
    const slippageMultiplier = side === "BUY"
      ? 1 + this.slippageBps / 10_000
      : 1 - this.slippageBps / 10_000;
    const fillPrice = referencePrice * slippageMultiplier;
    const signedQuantity = side === "SELL" ? -quantity : quantity;
    const notionalUsd = Math.abs(quantity * fillPrice);

    return {
      slippageBps: this.slippageBps,
      notionalUsd,
      event: {
        seq: nextSeq(),
        timestamp: nowMs,
        receiveTimestamp: nowMs,
        processingTimestamp: nowMs,
        source: "execution",
        symbol: order.symbol,
        eventType: "ORDER_FILLED",
        correlationId: order.correlationId,
        causationId: String(order.seq),
        payload: {
          orderClientId: order.payload.orderClientId,
          idempotencyKey: order.payload.idempotencyKey,
          side,
          quantity: signedQuantity,
          fillQuantity: quantity,
          price: fillPrice,
          referencePrice,
          slippageBps: this.slippageBps,
          notionalUsd,
          status: "FILLED",
          simulator: "paper_fill"
        }
      }
    };
  }
}
