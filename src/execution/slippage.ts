export function estimateSlippageBps(quantity: number, topOfBookQuantity: number): number {
  if (quantity <= 0 || topOfBookQuantity <= 0) return 10_000;
  const pressure = quantity / topOfBookQuantity;
  return Math.min(10_000, Math.ceil(pressure * 25));
}
