import type { RuntimeEvent } from "./event.js";
import { PrecisionMath } from "../infrastructure/PrecisionMath.js";

export type AlphaSide = "BUY" | "SELL";

export interface AlphaPositionSnapshot {
  readonly orderClientId: string;
  readonly symbol: string;
  readonly side: AlphaSide;
  readonly requestedPrice: string;
  readonly executedPrice?: string;
  readonly executedQuantity: string;
  readonly mae: string;
  readonly mfe: string;
  readonly fillDrift: string;
  readonly temporalLatencyMs: number;
  readonly acknowledgementDelayMs?: number;
  readonly signalToAckLatencyMs?: number;
  readonly intentToAckLatencyMs?: number;
  readonly rejectionReason?: string;
  readonly rejectedAt?: number;
  readonly expectedExecutionQuality?: string;
  readonly realizedExecutionQuality?: string;
  readonly evidenceIds: readonly string[];
}

interface AlphaPositionState {
  createdSeq: number;
  orderClientId: string;
  symbol: string;
  side: AlphaSide;
  requestedPrice: string;
  signalSeq?: number;
  signalCreatedAt?: number;
  intentSeq?: number;
  intentCreatedAt?: number;
  submittedAt: number;
  acknowledgedAt?: number;
  rejectedAt?: number;
  executedAt?: number;
  executedPrice?: string;
  executedQuantity: string;
  mae: string;
  mfe: string;
  fillDrift: string;
  rejectionReason?: string;
  expectedExecutionQuality?: string;
  realizedExecutionQuality?: string;
  evidenceIds: string[];
}

export interface StateManagerOptions {
  readonly maxTrackedOrders?: number;
  readonly maxEvidenceIdsPerOrder?: number;
}

export class StateManager {
  private readonly alphaByOrder = new Map<string, AlphaPositionState>();
  private readonly signalCreatedAt = new Map<number, number>();
  private readonly intentLineage = new Map<number, { signalSeq?: number; intentCreatedAt: number }>();
  private readonly maxTrackedOrders: number;
  private readonly maxEvidenceIdsPerOrder: number;

  constructor(options: StateManagerOptions = {}) {
    this.maxTrackedOrders = options.maxTrackedOrders ?? 1_000;
    this.maxEvidenceIdsPerOrder = options.maxEvidenceIdsPerOrder ?? 256;
    if (!Number.isInteger(this.maxTrackedOrders) || this.maxTrackedOrders <= 0) throw new Error("state_manager_max_tracked_orders_invalid");
    if (!Number.isInteger(this.maxEvidenceIdsPerOrder) || this.maxEvidenceIdsPerOrder <= 0) throw new Error("state_manager_max_evidence_ids_invalid");
  }

  apply(event: RuntimeEvent): readonly AlphaPositionSnapshot[] {
    if (event.eventType === "SIGNAL_CREATED") this.observeSignalCreated(event);
    if (event.eventType === "INTENT_CREATED") this.observeIntentCreated(event);
    if (event.eventType === "ORDER_SUBMITTED") this.observeOrderSubmitted(event);
    if (event.eventType === "ORDER_ACCEPTED") this.observeOrderAccepted(event);
    if (event.eventType === "ORDER_FILLED") this.observeOrderFilled(event);
    if (event.eventType === "ORDER_REJECTED" || event.eventType === "EXECUTION_ERROR") this.observeOrderRejected(event);
    if (event.eventType === "MARKET_TICK" || event.eventType === "BOOK_UPDATE") this.observeMark(event);
    return this.alphaSnapshots();
  }

  alphaSnapshots(): readonly AlphaPositionSnapshot[] {
    return [...this.alphaByOrder.values()]
      .sort((left, right) => left.orderClientId.localeCompare(right.orderClientId))
      .map((state) => ({
        orderClientId: state.orderClientId,
        symbol: state.symbol,
        side: state.side,
        requestedPrice: state.requestedPrice,
        ...(state.executedPrice === undefined ? {} : { executedPrice: state.executedPrice }),
        executedQuantity: state.executedQuantity,
        mae: state.mae,
        mfe: state.mfe,
        fillDrift: state.fillDrift,
        temporalLatencyMs: state.executedAt === undefined ? 0 : state.executedAt - state.submittedAt,
        ...(state.acknowledgedAt === undefined ? {} : { acknowledgementDelayMs: state.acknowledgedAt - state.submittedAt }),
        ...(state.acknowledgedAt === undefined || state.signalCreatedAt === undefined ? {} : { signalToAckLatencyMs: state.acknowledgedAt - state.signalCreatedAt }),
        ...(state.acknowledgedAt === undefined || state.intentCreatedAt === undefined ? {} : { intentToAckLatencyMs: state.acknowledgedAt - state.intentCreatedAt }),
        ...(state.rejectionReason === undefined ? {} : { rejectionReason: state.rejectionReason }),
        ...(state.rejectedAt === undefined ? {} : { rejectedAt: state.rejectedAt }),
        ...(state.expectedExecutionQuality === undefined ? {} : { expectedExecutionQuality: state.expectedExecutionQuality }),
        ...(state.realizedExecutionQuality === undefined ? {} : { realizedExecutionQuality: state.realizedExecutionQuality }),
        evidenceIds: [...state.evidenceIds]
      }));
  }

  private observeSignalCreated(event: RuntimeEvent): void {
    this.signalCreatedAt.set(event.seq, event.timestamp);
  }

  private observeIntentCreated(event: RuntimeEvent): void {
    const signalSeq = this.numericCausationId(event);
    this.intentLineage.set(event.seq, {
      ...(signalSeq === undefined ? {} : { signalSeq }),
      intentCreatedAt: event.timestamp
    });
  }

  private observeOrderSubmitted(event: RuntimeEvent): void {
    const orderClientId = this.orderClientId(event);
    const requestedPrice = this.decimalPayload(event, "limitPrice")
      ?? this.decimalPayload(event, "price")
      ?? this.decimalPayload(event, "markPrice");
    if (requestedPrice === undefined) throw new Error("alpha_requested_price_required");
    const side = event.payload.side === "SELL" ? "SELL" : "BUY";
    const intentSeq = this.numericCausationId(event);
    const lineage = intentSeq === undefined ? undefined : this.intentLineage.get(intentSeq);
    const signalSeq = lineage?.signalSeq;
    const signalCreatedAt = signalSeq === undefined ? undefined : this.signalCreatedAt.get(signalSeq);
    this.alphaByOrder.set(orderClientId, {
      createdSeq: event.seq,
      orderClientId,
      symbol: event.symbol,
      side,
      requestedPrice,
      ...(signalSeq === undefined ? {} : { signalSeq }),
      ...(signalCreatedAt === undefined ? {} : { signalCreatedAt }),
      ...(intentSeq === undefined ? {} : { intentSeq }),
      ...(lineage?.intentCreatedAt === undefined ? {} : { intentCreatedAt: lineage.intentCreatedAt }),
      submittedAt: event.timestamp,
      executedQuantity: "0",
      mae: "0",
      mfe: "0",
      fillDrift: "0",
      expectedExecutionQuality: "0",
      evidenceIds: [this.evidenceId(event)]
    });
    this.pruneTrackedOrders();
  }

  private observeOrderAccepted(event: RuntimeEvent): void {
    const state = this.findState(event);
    if (state === undefined) return;
    state.acknowledgedAt = event.exchangeTimestamp ?? event.receiveTimestamp ?? event.timestamp;
    this.appendEvidence(state, event);
  }

  private observeOrderFilled(event: RuntimeEvent): void {
    const state = this.findState(event);
    if (state === undefined) return;
    const executedPrice = this.decimalPayload(event, "price");
    const executedQuantity = this.decimalPayload(event, "quantity");
    if (executedPrice === undefined) throw new Error("alpha_executed_price_required");
    if (executedQuantity === undefined) throw new Error("alpha_executed_quantity_required");
    state.executedAt = event.exchangeTimestamp ?? event.receiveTimestamp ?? event.timestamp;
    state.executedPrice = executedPrice;
    state.executedQuantity = PrecisionMath.add(state.executedQuantity, PrecisionMath.abs(executedQuantity));
    state.fillDrift = signedPriceDelta(executedPrice, state.requestedPrice, state.side);
    state.realizedExecutionQuality = invertSign(state.fillDrift);
    this.appendEvidence(state, event);
  }

  private observeOrderRejected(event: RuntimeEvent): void {
    const state = this.findState(event);
    if (state === undefined) return;
    const reason = event.payload.reason;
    state.rejectionReason = typeof reason === "string" && reason.length > 0 ? reason : event.eventType;
    state.rejectedAt = event.exchangeTimestamp ?? event.receiveTimestamp ?? event.timestamp;
    this.appendEvidence(state, event);
  }

  private observeMark(event: RuntimeEvent): void {
    const mark = this.decimalPayload(event, "markPrice")
      ?? this.decimalPayload(event, "price")
      ?? this.midPrice(event);
    if (mark === undefined) return;
    for (const state of this.alphaByOrder.values()) {
      if (state.symbol !== event.symbol) continue;
      const excursion = signedPriceDelta(mark, state.requestedPrice, state.side);
      if (PrecisionMath.compare(excursion, "0") < 0 && PrecisionMath.compare(PrecisionMath.abs(excursion), state.mae) > 0) {
        state.mae = PrecisionMath.abs(excursion);
      }
      if (PrecisionMath.compare(excursion, "0") > 0 && PrecisionMath.compare(excursion, state.mfe) > 0) {
        state.mfe = excursion;
      }
      this.appendEvidence(state, event);
    }
  }

  private findState(event: RuntimeEvent): AlphaPositionState | undefined {
    return this.alphaByOrder.get(this.orderClientId(event));
  }

  private orderClientId(event: RuntimeEvent): string {
    const value = event.payload.orderClientId ?? event.payload.newClientOrderId ?? event.payload.idempotencyKey ?? event.causationId;
    if (typeof value !== "string" || value.length === 0) throw new Error("alpha_order_client_id_required");
    return value;
  }

  private decimalPayload(event: RuntimeEvent, key: string): string | undefined {
    const value = event.payload[key];
    if (typeof value === "string") return PrecisionMath.assertDecimal(value, key);
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error(`${key}_invalid_decimal`);
      return PrecisionMath.assertDecimal(String(value), key);
    }
    return undefined;
  }

  private midPrice(event: RuntimeEvent): string | undefined {
    const bid = this.decimalPayload(event, "bidPrice") ?? this.decimalPayload(event, "bid");
    const ask = this.decimalPayload(event, "askPrice") ?? this.decimalPayload(event, "ask");
    if (bid === undefined || ask === undefined) return undefined;
    return PrecisionMath.divide(PrecisionMath.add(bid, ask), "2", 8);
  }

  private evidenceId(event: RuntimeEvent): string {
    return event.eventId ?? `${event.eventType}:${event.seq}`;
  }

  private numericCausationId(event: RuntimeEvent): number | undefined {
    if (!/^\d+$/.test(event.causationId)) return undefined;
    const value = Number(event.causationId);
    return Number.isSafeInteger(value) ? value : undefined;
  }

  private appendEvidence(state: AlphaPositionState, event: RuntimeEvent): void {
    state.evidenceIds.push(this.evidenceId(event));
    while (state.evidenceIds.length > this.maxEvidenceIdsPerOrder) {
      state.evidenceIds.shift();
    }
  }

  private pruneTrackedOrders(): void {
    while (this.alphaByOrder.size > this.maxTrackedOrders) {
      const oldest = [...this.alphaByOrder.values()].sort((left, right) => left.createdSeq - right.createdSeq)[0];
      if (oldest === undefined) return;
      this.alphaByOrder.delete(oldest.orderClientId);
    }
  }
}

function signedPriceDelta(observed: string, basis: string, side: AlphaSide): string {
  const raw = PrecisionMath.subtract(observed, basis);
  return side === "BUY" ? raw : invertSign(raw);
}

function invertSign(value: string): string {
  if (value === "0") return "0";
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}
