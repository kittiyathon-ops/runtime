import type { RuntimeEvent } from "../core/event.js";
import { newId } from "../core/ids.js";
import type { RiskEngine } from "../risk/risk-engine.js";
import type { ExecutionPlan, OrderIntent } from "./order.js";
import { estimateSlippageBps } from "./slippage.js";

export type ExecutionMode = "NORMAL" | "PAPER" | "REPLAY" | "SAFE_MODE" | "HIBERNATION_MODE" | "GOVERNANCE_HALT" | "STOPPING" | "HALTED";

export interface ExecutionResult {
  accepted: boolean;
  events: RuntimeEvent[];
}

export class ExecutionEngine {
  constructor(private readonly risk: RiskEngine) {}

  simulate(
    event: RuntimeEvent,
    mode: ExecutionMode,
    nextSeq: () => number,
    nowMs: number
  ): ExecutionResult {
    if (mode === "SAFE_MODE" || mode === "HIBERNATION_MODE" || mode === "GOVERNANCE_HALT" || mode === "HALTED") {
      return { accepted: false, events: [] };
    }

    const plan = this.plan(event);
    if (!plan) {
      return { accepted: false, events: [] };
    }

    return this.submit(plan, event, nextSeq, nowMs);
  }

  plan(event: RuntimeEvent): ExecutionPlan | undefined {
    if (event.eventType !== "INTENT_CREATED") return undefined;
    const quantity = Number(event.payload.quantity);
    const topOfBookQuantity = Number(event.payload.topOfBookQuantity ?? quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return undefined;

    const childCount = Math.min(5, Math.max(1, Math.ceil(quantity / Number(event.payload.maxChildQuantity ?? quantity))));
    const childQuantity = quantity / childCount;
    const orders: OrderIntent[] = Array.from({ length: childCount }, () => ({
      symbol: event.symbol,
      side: event.payload.side === "SELL" ? "SELL" : "BUY",
      type: event.payload.type === "LIMIT" ? "LIMIT" : "MARKET",
      quantity: childQuantity,
      reduceOnly: event.payload.reduceOnly === true,
      passive: event.payload.passive === true,
      correlationId: event.correlationId,
      ...(typeof event.payload.limitPrice === "number" ? { limitPrice: event.payload.limitPrice } : {})
    }));
    return {
      idempotencyKey: `${event.correlationId}:${event.seq}`,
      parentIntentId: event.causationId,
      orders,
      estimatedSlippageBps: estimateSlippageBps(quantity, topOfBookQuantity)
    };
  }

  submit(plan: ExecutionPlan, causationEvent: RuntimeEvent, nextSeq: () => number, nowMs: number): ExecutionResult {
    const decision = this.risk.evaluateIntent(causationEvent, nowMs);
    if (!decision.allow) {
      return {
        accepted: false,
        events: [
          this.toEvent(nextSeq(), nowMs, causationEvent, "RISK_ALERT", {
            reason: decision.reason ?? "risk_rejected",
            planId: plan.idempotencyKey
          })
        ]
      };
    }

    return {
      accepted: true,
      events: plan.orders.map((order) =>
        this.toEvent(nextSeq(), nowMs, causationEvent, "ORDER_SUBMITTED", {
          ...order,
          orderClientId: newId("ord"),
          idempotencyKey: plan.idempotencyKey,
          estimatedSlippageBps: plan.estimatedSlippageBps,
          status: "SUBMITTED"
        })
      )
    };
  }

  private toEvent(
    seq: number,
    nowMs: number,
    causationEvent: RuntimeEvent,
    eventType: RuntimeEvent["eventType"],
    payload: RuntimeEvent["payload"]
  ): RuntimeEvent {
    return {
      seq,
      timestamp: nowMs,
      receiveTimestamp: nowMs,
      processingTimestamp: nowMs,
      source: "execution",
      symbol: causationEvent.symbol,
      eventType,
      correlationId: causationEvent.correlationId,
      causationId: String(causationEvent.seq),
      payload
    };
  }
}
