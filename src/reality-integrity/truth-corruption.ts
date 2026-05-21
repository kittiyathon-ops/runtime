export function truthCorruption(replayPoisoned: boolean, forgedProvenance: boolean, semanticCorruption: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("truth_corruption_requires_evidence");
  const score = [replayPoisoned, forgedProvenance, semanticCorruption].filter(Boolean).length / 3;
  return { status: score > 0 ? "CORRUPTED" as const : "CLEAN" as const, score, evidenceIds: [...evidenceIds] };
}
