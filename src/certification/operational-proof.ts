export function operationalProof(boundedAdaptation: boolean, entropyStable: boolean, operatorSurvivable: boolean, degradationReady: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("operational_proof_requires_evidence");
  const proven = boundedAdaptation && entropyStable && operatorSurvivable && degradationReady;
  return { domain: "operational" as const, status: proven ? "PROVEN" as const : "FAILED" as const, evidenceIds: [...evidenceIds] };
}
