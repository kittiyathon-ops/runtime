export function epistemicContamination(forgedProvenance: boolean, staleValidEvidence: boolean, delayedTruth: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("epistemic_contamination_requires_evidence");
  const score = [forgedProvenance, staleValidEvidence, delayedTruth].filter(Boolean).length / 3;
  return { status: score > 0 ? "CONTAMINATED" as const : "CLEAN" as const, score, evidenceIds: [...evidenceIds] };
}
