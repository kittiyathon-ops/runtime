export function cognitiveInfection(semanticCorruption: boolean, doctrinePathogen: boolean, identityCorruption: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("cognitive_infection_requires_evidence");
  const score = [semanticCorruption, doctrinePathogen, identityCorruption].filter(Boolean).length / 3;
  return { status: score > 0 ? "INFECTED" as const : "CLEAR" as const, score, evidenceIds: [...evidenceIds] };
}
