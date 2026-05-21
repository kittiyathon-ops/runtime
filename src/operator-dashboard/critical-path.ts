export function criticalPath(items: readonly { id: string; priority: number; evidenceIds: readonly string[] }[], limit: number, evidenceIds: string[]) {
  if (items.length === 0 || limit <= 0 || evidenceIds.length === 0) throw new Error("critical_path_requires_evidence");
  const selected = [...items].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, limit).map((item) => {
    if (item.id.length === 0 || item.evidenceIds.length === 0) throw new Error("critical_path_item_requires_evidence");
    return item.id;
  });
  return { status: "CRITICAL_PATH_COMPRESSED" as const, selected, evidenceIds: [...evidenceIds] };
}
