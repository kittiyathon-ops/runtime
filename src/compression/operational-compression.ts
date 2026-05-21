export function operationalCompression(items: readonly string[], evidenceIds: string[]) {
  if (items.length === 0 || evidenceIds.length === 0) throw new Error("operational_compression_requires_evidence");
  const compressed = Array.from(new Set(items)).sort();
  return { status: "COMPRESSED" as const, originalCount: items.length, compressedCount: compressed.length, compressed, evidenceIds: [...evidenceIds] };
}
