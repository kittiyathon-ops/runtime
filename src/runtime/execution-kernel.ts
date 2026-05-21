import type { RuntimeEvent } from "../core/event.js";

export type ExecutionKernelMode = "ACTIVE" | "PASSIVE_ONLY" | "REDUCE_ONLY" | "SAFE_MODE" | "HALT";

export interface ExecutionIntent {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: number;
  reduceOnly?: boolean;
  passive?: boolean;
  limitPrice?: number;
}

export interface ExecutionKernelContext {
  mode: ExecutionKernelMode;
  currentPositionQuantity: number;
  maxQuantity?: number;
}

export interface ExecutionValidationFailure {
  code: string;
  message: string;
}

export interface ExecutionKernelDecision {
  accepted: boolean;
  intent?: ExecutionIntent;
  failures: ExecutionValidationFailure[];
}

export class ExecutionKernel {
  validate(intent: ExecutionIntent, context: ExecutionKernelContext): ExecutionKernelDecision {
    const failures: ExecutionValidationFailure[] = [];
    const transformed: ExecutionIntent = { ...intent };

    if (context.mode === "HALT" || context.mode === "SAFE_MODE") {
      failures.push({ code: "execution_mode_blocked", message: `mode ${context.mode} blocks execution` });
    }
    if (!Number.isFinite(intent.quantity) || intent.quantity <= 0) {
      failures.push({ code: "quantity_invalid", message: "quantity must be positive" });
    }
    if (intent.type === "LIMIT" && (intent.limitPrice === undefined || intent.limitPrice <= 0)) {
      failures.push({ code: "limit_price_invalid", message: "limit order requires positive limitPrice" });
    }
    if (context.mode === "PASSIVE_ONLY" && (intent.type !== "LIMIT" || intent.passive !== true)) {
      failures.push({ code: "passive_only_violation", message: "PASSIVE_ONLY requires passive limit intent" });
    }
    if (context.mode === "REDUCE_ONLY") {
      transformed.reduceOnly = true;
      if (!this.reducesPosition(intent, context.currentPositionQuantity)) {
        failures.push({ code: "reduce_only_violation", message: "REDUCE_ONLY intent must reduce current exposure" });
      }
    }
    if (context.maxQuantity !== undefined && transformed.quantity > context.maxQuantity) {
      transformed.quantity = context.maxQuantity;
    }

    return failures.length === 0
      ? { accepted: true, intent: transformed, failures }
      : { accepted: false, failures };
  }

  failureEvents(failures: ExecutionValidationFailure[], causationEvent: RuntimeEvent, nextSeq: () => number, nowMs: number): RuntimeEvent[] {
    return failures.map((failure) => ({
      seq: nextSeq(),
      timestamp: nowMs,
      receiveTimestamp: nowMs,
      processingTimestamp: nowMs,
      source: "execution",
      symbol: causationEvent.symbol,
      eventType: "ORDER_REJECTED",
      correlationId: causationEvent.correlationId,
      causationId: String(causationEvent.seq),
      payload: { ...failure }
    }));
  }

  private reducesPosition(intent: ExecutionIntent, currentPositionQuantity: number): boolean {
    if (currentPositionQuantity === 0) return false;
    if (currentPositionQuantity > 0) return intent.side === "SELL";
    return intent.side === "BUY";
  }
}
