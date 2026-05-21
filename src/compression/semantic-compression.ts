export function semanticCompression(meaningPreserved: boolean, statements: readonly string[], evidenceIds: string[]) {
  if (statements.length === 0 || evidenceIds.length === 0) throw new Error("compression_semantic_requires_evidence");
  return { status: meaningPreserved ? "MEANING_PRESERVED" as const : "REJECTED" as const, summary: Array.from(new Set(statements)).sort().join(" | "), evidenceIds: [...evidenceIds] };
}
