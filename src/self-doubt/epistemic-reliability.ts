export function epistemicReliability(confidence: number, contradictionScore: number, semanticScore: number, evidenceIds: string[]) {
  if (confidence < 0 || contradictionScore < 0 || semanticScore < 0 || evidenceIds.length === 0) throw new Error("epistemic_reliability_requires_evidence");
  const reliability = Math.max(0, confidence - contradictionScore - semanticScore);
  return { status: reliability >= 0.5 ? "EPISTEMIC_RELIABLE" as const : "EPISTEMIC_UNRELIABLE" as const, reliability, evidenceIds: [...evidenceIds] };
}
