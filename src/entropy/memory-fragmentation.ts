export function memoryFragmentation(fragments: number, maxFragments: number, evidenceIds: string[]) {
  if (fragments < 0 || maxFragments < 0 || evidenceIds.length === 0) throw new Error("memory_fragmentation_requires_evidence");
  return { status: fragments > maxFragments ? "MEMORY_FRAGMENTED" as const : "MEMORY_BOUNDED" as const, fragments, maxFragments, evidenceIds: [...evidenceIds] };
}
