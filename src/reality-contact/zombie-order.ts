export function zombieOrder(localOpenOrderIds: readonly string[], exchangeOpenOrderIds: readonly string[], evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("zombie_order_requires_evidence");
  const local = new Set(localOpenOrderIds);
  const zombies = [...exchangeOpenOrderIds].filter((orderId) => !local.has(orderId)).sort();
  return { status: zombies.length > 0 ? "ZOMBIE_ORDER_DETECTED" as const : "ZOMBIE_ORDER_CLEAR" as const, zombies, evidenceIds: [...evidenceIds] };
}
