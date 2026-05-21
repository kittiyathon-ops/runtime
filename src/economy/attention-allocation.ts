export function attentionAllocation(items: readonly { itemId: string; survivabilityValue: number; urgency: number; cost: number; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (items.length === 0 || evidenceIds.length === 0) throw new Error("attention_allocation_requires_evidence");
  const ranked = items
    .map((item) => {
      if (item.itemId.length === 0 || item.survivabilityValue < 0 || item.urgency < 0 || item.cost < 0 || item.evidenceIds.length === 0) throw new Error("attention_item_requires_evidence");
      return { itemId: item.itemId, priority: (item.survivabilityValue + item.urgency) / (item.cost + 1), evidenceIds: [...item.evidenceIds] };
    })
    .sort((a, b) => b.priority - a.priority || a.itemId.localeCompare(b.itemId));
  return { status: "ATTENTION_ALLOCATED" as const, ranked, evidenceIds: [...evidenceIds] };
}
