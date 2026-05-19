export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT";

export interface OrderIntent {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  limitPrice?: number;
  reduceOnly: boolean;
  passive: boolean;
  correlationId: string;
}

export interface ExecutionPlan {
  idempotencyKey: string;
  parentIntentId: string;
  orders: OrderIntent[];
  estimatedSlippageBps: number;
}
