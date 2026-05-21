export function evidenceCompaction(evidenceIds: readonly string[]) {
  if (evidenceIds.length === 0) throw new Error("compression_evidence_compaction_requires_evidence");
  return { compactedEvidenceIds: Array.from(new Set(evidenceIds)).sort(), originalCount: evidenceIds.length };
}
