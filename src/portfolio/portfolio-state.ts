import type { RuntimeEvent } from "../core/event.js";
import { PrecisionMath } from "../infrastructure/PrecisionMath.js";

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  unrealizedPnl: number;
}

export interface PortfolioSnapshot {
  positions: Record<string, Position>;
  realizedPnl: number;
  feesUsd: number;
  fundingUsd: number;
  equityUsd: number;
}

export class PortfolioState {
  private readonly positions = new Map<string, Position>();
  private realizedPnl = 0;
  private feesUsd = 0;
  private fundingUsd = 0;
  private equityUsd = 0;

  apply(event: RuntimeEvent): void {
    if (event.eventType === "FEE_CHARGED") {
      this.applyAccountingDelta(event, "fee");
      return;
    }
    if (event.eventType === "FUNDING_FEE_APPLIED") {
      this.applyAccountingDelta(event, "funding");
      return;
    }
    if (event.eventType === "REALIZED_PNL_UPDATED") {
      this.applyAccountingDelta(event, "realized_pnl");
      return;
    }
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
      feesUsd: this.feesUsd,
      fundingUsd: this.fundingUsd,
      equityUsd: this.equityUsd
    };
  }

  private applyAccountingDelta(event: RuntimeEvent, kind: "fee" | "funding" | "realized_pnl"): void {
    const amount = decimalPayload(event, "amountUsd");
    if (amount === undefined) return;
    if (kind === "fee") {
      this.feesUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.feesUsd), amount));
      this.realizedPnl = decimalToNumber(PrecisionMath.subtract(decimalFromNumber(this.realizedPnl), amount));
      this.equityUsd = decimalToNumber(PrecisionMath.subtract(decimalFromNumber(this.equityUsd), amount));
      return;
    }
    this.realizedPnl = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.realizedPnl), amount));
    this.equityUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.equityUsd), amount));
    if (kind === "funding") {
      this.fundingUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.fundingUsd), amount));
    }
  }
}

function decimalPayload(event: RuntimeEvent, key: string): string | undefined {
  const value = event.payload[key];
  if (typeof value === "string") return PrecisionMath.assertDecimal(value, key);
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return PrecisionMath.assertDecimal(String(value), key);
}

function decimalFromNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("portfolio_decimal_number_invalid");
  return PrecisionMath.assertDecimal(String(value), "portfolio_decimal");
}

function decimalToNumber(value: string): number {
  const number = Number(PrecisionMath.normalize(value));
  if (!Number.isFinite(number)) throw new Error("portfolio_decimal_conversion_invalid");
  return number;
}
