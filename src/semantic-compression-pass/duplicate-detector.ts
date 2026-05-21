export function duplicateDetector(items: readonly { id: string; semanticSignature: string; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (items.length === 0 || evidenceIds.length === 0) throw new Error("duplicate_detector_requires_evidence");
  const seen = new Map<string, string[]>();
  for (const item of items) {
    if (item.id.length === 0 || item.semanticSignature.length === 0 || item.evidenceIds.length === 0) throw new Error("duplicate_item_requires_evidence");
    seen.set(item.semanticSignature, [...(seen.get(item.semanticSignature) ?? []), item.id].sort());
  }
  const duplicates = [...seen.entries()].filter(([, ids]) => ids.length > 1).map(([semanticSignature, ids]) => ({ semanticSignature, ids }));
  return { status: duplicates.length > 0 ? "DUPLICATES_FOUND" as const : "NO_DUPLICATES" as const, duplicates, evidenceIds: [...evidenceIds] };
}
