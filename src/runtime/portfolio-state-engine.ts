import type { RuntimeEvent } from "../core/event.js";
import { PrecisionMath } from "../infrastructure/PrecisionMath.js";

export interface PortfolioPosition {
  symbol: string;
  quantity: number;
  averagePrice: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  feesUsd: number;
  fundingUsd: number;
  liquidations: number;
  openedAtSeq?: number;
  closedAtSeq?: number;
}

export interface PortfolioBalance {
  asset: string;
  available: number;
  total: number;
}

export interface PortfolioSnapshot {
  positions: Record<string, PortfolioPosition>;
  balances: Record<string, PortfolioBalance>;
  cashUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  feesUsd: number;
  fundingUsd: number;
  exposureUsd: number;
  lastSeq: number;
  appliedFillIds: string[];
}

export type PortfolioState = PortfolioSnapshot;
export type PortfolioStateSnapshot = PortfolioSnapshot;

export interface PortfolioDivergence {
  type:
    | "expected_position_mismatch"
    | "expected_balance_mismatch"
    | "expected_pnl_mismatch"
    | "missing_fill"
    | "duplicate_fill"
    | "out_of_order_fill";
  symbol?: string;
  expected?: number | string;
  actual?: number | string;
  seq?: number;
  eventId?: string;
  reason: string;
}

export interface PortfolioDivergenceReport {
  divergent: boolean;
  divergences: PortfolioDivergence[];
}

export class PortfolioStateEngine {
  private readonly positions = new Map<string, PortfolioPosition>();
  private readonly balances = new Map<string, PortfolioBalance>();
  private readonly appliedFillIds = new Set<string>();
  private readonly fillOrder: string[] = [];
  private cashUsd = 0;
  private realizedPnlUsd = 0;
  private feesUsd = 0;
  private fundingUsd = 0;
  private lastSeq = 0;

  apply(event: RuntimeEvent): PortfolioSnapshot {
    if (event.seq <= this.lastSeq) throw new Error(`portfolio_event_out_of_order:${event.seq}`);
    if (event.eventType === "ORDER_FILLED") this.applyFill(event);
    if (event.eventType === "POSITION_UPDATED") this.applyPositionUpdate(event);
    if (event.eventType === "FEE_CHARGED") this.applyFee(event);
    if (event.eventType === "FUNDING_FEE_APPLIED") this.applyFunding(event);
    if (event.eventType === "REALIZED_PNL_UPDATED") this.applyRealizedPnl(event);
    if (event.eventType === "MARKET_TICK" || event.eventType === "BOOK_UPDATE") this.applyMark(event);
    this.lastSeq = event.seq;
    return this.snapshot();
  }

  snapshot(): PortfolioSnapshot {
    const positions = Object.fromEntries([...this.positions.entries()].map(([symbol, position]) => [symbol, { ...position }]));
    const balances = Object.fromEntries([...this.balances.entries()].map(([asset, balance]) => [asset, { ...balance }]));
    const unrealizedPnlUsd = Object.values(positions).reduce((sum, position) => sum + position.unrealizedPnlUsd, 0);
    const exposureUsd = Object.values(positions).reduce((sum, position) => sum + Math.abs(position.quantity * position.averagePrice), 0);
    return {
      positions,
      balances,
      cashUsd: this.cashUsd,
      realizedPnlUsd: this.realizedPnlUsd,
      unrealizedPnlUsd,
      feesUsd: this.feesUsd,
      fundingUsd: this.fundingUsd,
      exposureUsd,
      lastSeq: this.lastSeq,
      appliedFillIds: [...this.fillOrder]
    };
  }

  restore(snapshot: PortfolioSnapshot): void {
    this.positions.clear();
    this.balances.clear();
    this.appliedFillIds.clear();
    this.fillOrder.length = 0;
    for (const [symbol, position] of Object.entries(snapshot.positions)) this.positions.set(symbol, { ...position });
    for (const [asset, balance] of Object.entries(snapshot.balances)) this.balances.set(asset, { ...balance });
    for (const fillId of snapshot.appliedFillIds) {
      this.appliedFillIds.add(fillId);
      this.fillOrder.push(fillId);
    }
    this.cashUsd = snapshot.cashUsd;
    this.realizedPnlUsd = snapshot.realizedPnlUsd;
    this.feesUsd = snapshot.feesUsd;
    this.fundingUsd = snapshot.fundingUsd;
    this.lastSeq = snapshot.lastSeq;
  }

  compareExpected(expected: {
    positions?: Record<string, number>;
    balances?: Record<string, number>;
    realizedPnlUsd?: number;
    feesUsd?: number;
    fundingUsd?: number;
  }, tolerance = 1e-8): PortfolioDivergenceReport {
    const snapshot = this.snapshot();
    const divergences: PortfolioDivergence[] = [];
    for (const [symbol, quantity] of Object.entries(expected.positions ?? {})) {
      const actual = snapshot.positions[symbol]?.quantity ?? 0;
      if (Math.abs(actual - quantity) > tolerance) {
        divergences.push({ type: "expected_position_mismatch", symbol, expected: quantity, actual, reason: "position_quantity_mismatch" });
      }
    }
    for (const [asset, total] of Object.entries(expected.balances ?? {})) {
      const actual = snapshot.balances[asset]?.total ?? 0;
      if (Math.abs(actual - total) > tolerance) {
        divergences.push({ type: "expected_balance_mismatch", expected: total, actual, reason: `balance_mismatch:${asset}` });
      }
    }
    if (expected.realizedPnlUsd !== undefined && Math.abs(snapshot.realizedPnlUsd - expected.realizedPnlUsd) > tolerance) {
      divergences.push({
        type: "expected_pnl_mismatch",
        expected: expected.realizedPnlUsd,
        actual: snapshot.realizedPnlUsd,
        reason: "realized_pnl_mismatch"
      });
    }
    if (expected.feesUsd !== undefined && Math.abs(snapshot.feesUsd - expected.feesUsd) > tolerance) {
      divergences.push({
        type: "expected_pnl_mismatch",
        expected: expected.feesUsd,
        actual: snapshot.feesUsd,
        reason: "fees_mismatch"
      });
    }
    if (expected.fundingUsd !== undefined && Math.abs(snapshot.fundingUsd - expected.fundingUsd) > tolerance) {
      divergences.push({
        type: "expected_pnl_mismatch",
        expected: expected.fundingUsd,
        actual: snapshot.fundingUsd,
        reason: "funding_mismatch"
      });
    }
    return { divergent: divergences.length > 0, divergences };
  }

  static reconstruct(events: RuntimeEvent[]): PortfolioSnapshot {
    const engine = new PortfolioStateEngine();
    for (const event of events) engine.apply(event);
    return engine.snapshot();
  }

  private applyFill(event: RuntimeEvent): void {
    const fillId = fillIdFor(event);
    if (this.appliedFillIds.has(fillId)) throw new Error(`portfolio_duplicate_fill:${fillId}`);
    const quantity = fillQuantity(event);
    const price = numberPayload(event, "price");
    if (quantity === undefined || price === undefined || quantity === 0 || price <= 0) return;
    const feeUsd = decimalPayload(event, "feeUsd") ?? decimalPayload(event, "commissionUsd") ?? "0";
    const fundingUsd = decimalPayload(event, "fundingUsd") ?? "0";
    const balanceDeltaUsd = numberPayload(event, "balanceDeltaUsd") ?? 0;
    const position = this.positions.get(event.symbol) ?? emptyPosition(event.symbol);
    const wasFlat = position.quantity === 0;
    const realizedBeforeCosts = this.applyPositionFill(position, quantity, price);
    this.addFeeToPosition(position, feeUsd);
    this.addFundingToPosition(position, fundingUsd);
    position.realizedPnlUsd = decimalToNumber(PrecisionMath.add(
      PrecisionMath.add(decimalFromNumber(position.realizedPnlUsd), decimalFromNumber(realizedBeforeCosts)),
      PrecisionMath.subtract(fundingUsd, feeUsd)
    ));
    if (wasFlat && position.quantity !== 0) position.openedAtSeq = event.seq;
    if (position.quantity === 0) position.closedAtSeq = event.seq;
    if (event.payload.liquidation === true) position.liquidations += 1;
    this.realizedPnlUsd = decimalToNumber(PrecisionMath.add(
      PrecisionMath.add(decimalFromNumber(this.realizedPnlUsd), decimalFromNumber(realizedBeforeCosts)),
      PrecisionMath.subtract(fundingUsd, feeUsd)
    ));
    this.feesUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.feesUsd), feeUsd));
    this.fundingUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.fundingUsd), fundingUsd));
    this.cashUsd = decimalToNumber(PrecisionMath.add(
      PrecisionMath.add(decimalFromNumber(this.cashUsd), decimalFromNumber(realizedBeforeCosts)),
      PrecisionMath.add(PrecisionMath.subtract(fundingUsd, feeUsd), decimalFromNumber(balanceDeltaUsd))
    ));
    position.unrealizedPnlUsd = money((price - position.averagePrice) * position.quantity);
    this.positions.set(event.symbol, position);
    this.appliedFillIds.add(fillId);
    this.fillOrder.push(fillId);
  }

  private applyPositionUpdate(event: RuntimeEvent): void {
    const quantity = numberPayload(event, "quantity");
    const price = numberPayload(event, "price") ?? numberPayload(event, "averagePrice");
    const unrealizedPnl = numberPayload(event, "unrealizedPnl") ?? 0;
    if (quantity === undefined || price === undefined) return;
    const realizedPnl = numberPayload(event, "realizedPnl") ?? 0;
    this.positions.set(event.symbol, {
      ...emptyPosition(event.symbol),
      quantity,
      averagePrice: price,
      realizedPnlUsd: realizedPnl,
      unrealizedPnlUsd: unrealizedPnl
    });
  }

  private applyFee(event: RuntimeEvent): void {
    const feeUsd = accountingAmount(event, ["amountUsd", "feeUsd", "commissionUsd"]);
    if (feeUsd === undefined) return;
    const position = this.positions.get(event.symbol) ?? emptyPosition(event.symbol);
    this.addFeeToPosition(position, feeUsd);
    position.realizedPnlUsd = decimalToNumber(PrecisionMath.subtract(decimalFromNumber(position.realizedPnlUsd), feeUsd));
    this.positions.set(event.symbol, position);
    this.feesUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.feesUsd), feeUsd));
    this.realizedPnlUsd = decimalToNumber(PrecisionMath.subtract(decimalFromNumber(this.realizedPnlUsd), feeUsd));
    this.cashUsd = decimalToNumber(PrecisionMath.subtract(decimalFromNumber(this.cashUsd), feeUsd));
  }

  private applyFunding(event: RuntimeEvent): void {
    const fundingUsd = accountingAmount(event, ["amountUsd", "fundingUsd", "fundingFeeUsd"]);
    if (fundingUsd === undefined) return;
    const position = this.positions.get(event.symbol) ?? emptyPosition(event.symbol);
    this.addFundingToPosition(position, fundingUsd);
    position.realizedPnlUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(position.realizedPnlUsd), fundingUsd));
    this.positions.set(event.symbol, position);
    this.fundingUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.fundingUsd), fundingUsd));
    this.realizedPnlUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.realizedPnlUsd), fundingUsd));
    this.cashUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.cashUsd), fundingUsd));
  }

  private applyRealizedPnl(event: RuntimeEvent): void {
    const realizedPnlUsd = accountingAmount(event, ["amountUsd", "realizedPnlUsd", "realizedPnlDeltaUsd"]);
    if (realizedPnlUsd === undefined) return;
    const position = this.positions.get(event.symbol) ?? emptyPosition(event.symbol);
    position.realizedPnlUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(position.realizedPnlUsd), realizedPnlUsd));
    this.positions.set(event.symbol, position);
    this.realizedPnlUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.realizedPnlUsd), realizedPnlUsd));
    this.cashUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(this.cashUsd), realizedPnlUsd));
  }

  private addFeeToPosition(position: PortfolioPosition, feeUsd: string): void {
    position.feesUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(position.feesUsd), feeUsd));
  }

  private addFundingToPosition(position: PortfolioPosition, fundingUsd: string): void {
    position.fundingUsd = decimalToNumber(PrecisionMath.add(decimalFromNumber(position.fundingUsd), fundingUsd));
  }

  private applyMark(event: RuntimeEvent): void {
    const mark = numberPayload(event, "markPrice") ?? numberPayload(event, "price") ?? midPrice(event);
    if (mark === undefined || mark <= 0) return;
    const position = this.positions.get(event.symbol);
    if (position === undefined || position.quantity === 0) return;
    position.unrealizedPnlUsd = money((mark - position.averagePrice) * position.quantity);
  }

  private applyPositionFill(position: PortfolioPosition, quantity: number, price: number): number {
    const previousQuantity = position.quantity;
    if (previousQuantity === 0 || Math.sign(previousQuantity) === Math.sign(quantity)) {
      const nextQuantity = previousQuantity + quantity;
      position.averagePrice = nextQuantity === 0
        ? 0
        : ((Math.abs(previousQuantity) * position.averagePrice) + (Math.abs(quantity) * price)) / Math.abs(nextQuantity);
      position.quantity = nextQuantity;
      return 0;
    }

    const closed = Math.min(Math.abs(previousQuantity), Math.abs(quantity));
    const realized = closed * (price - position.averagePrice) * Math.sign(previousQuantity);
    const nextQuantity = previousQuantity + quantity;
    position.quantity = nextQuantity;
    if (nextQuantity === 0) {
      position.averagePrice = 0;
    } else if (Math.sign(nextQuantity) !== Math.sign(previousQuantity)) {
      position.averagePrice = price;
    }
    return realized;
  }
}

function emptyPosition(symbol: string): PortfolioPosition {
  return {
    symbol,
    quantity: 0,
    averagePrice: 0,
    realizedPnlUsd: 0,
    unrealizedPnlUsd: 0,
    feesUsd: 0,
    fundingUsd: 0,
    liquidations: 0
  };
}

function fillQuantity(event: RuntimeEvent): number | undefined {
  const quantity = numberPayload(event, "quantity");
  if (quantity === undefined) return undefined;
  const side = event.payload.side;
  if (typeof side !== "string") return quantity;
  if (side === "BUY") return Math.abs(quantity);
  if (side === "SELL") return -Math.abs(quantity);
  return quantity;
}

function fillIdFor(event: RuntimeEvent): string {
  const payloadFillId = event.payload.fillId ?? event.payload.tradeId ?? event.payload.orderId;
  return event.eventId ?? `${event.symbol}:${String(payloadFillId ?? event.seq)}`;
}

function numberPayload(event: RuntimeEvent, key: string): number | undefined {
  const value = event.payload[key];
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

function decimalPayload(event: RuntimeEvent, key: string): string | undefined {
  const value = event.payload[key];
  if (typeof value === "string") return PrecisionMath.assertDecimal(value, key);
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return PrecisionMath.assertDecimal(String(value), key);
}

function accountingAmount(event: RuntimeEvent, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const amount = decimalPayload(event, key);
    if (amount !== undefined) return amount;
  }
  return undefined;
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

function midPrice(event: RuntimeEvent): number | undefined {
  const bid = numberPayload(event, "bid") ?? numberPayload(event, "bidPrice");
  const ask = numberPayload(event, "ask") ?? numberPayload(event, "askPrice");
  if (bid === undefined || ask === undefined || bid <= 0 || ask <= 0) return undefined;
  return (bid + ask) / 2;
}

function money(value: number): number {
  return Number(value.toFixed(8));
}
