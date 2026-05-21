export function explainabilityCompression(originalItems: number, compressedItems: number, causalMeaningPreserved: boolean, evidenceIds: string[]) {
  if (originalItems <= 0 || compressedItems < 0 || evidenceIds.length === 0) throw new Error("operator_explainability_compression_requires_evidence");
  return { status: compressedItems <= originalItems && causalMeaningPreserved ? "EXPLANATION_COMPRESSED" as const : "COMPRESSION_REJECTED" as const, originalItems, compressedItems, evidenceIds: [...evidenceIds] };
}
