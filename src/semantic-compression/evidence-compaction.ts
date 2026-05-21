export function evidenceCompaction(evidenceIds: readonly string[]): { compactedEvidenceIds: string[]; originalCount: number } {
  if (evidenceIds.length === 0) throw new Error("evidence_compaction_requires_evidence");
  return { compactedEvidenceIds: Array.from(new Set(evidenceIds)).sort(), originalCount: evidenceIds.length };
}
