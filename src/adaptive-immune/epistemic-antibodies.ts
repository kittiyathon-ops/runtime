export function epistemicAntibodies(signature: string, knownSignatures: readonly string[], evidenceIds: string[]) {
  if (signature.length === 0 || evidenceIds.length === 0) throw new Error("epistemic_antibodies_require_evidence");
  const recurring = knownSignatures.includes(signature);
  return {
    signature,
    status: recurring ? "ANTIBODY_MATCH" as const : "ANTIBODY_GENERATED" as const,
    response: recurring ? "reuse_known_reality_poisoning_defense" as const : "quarantine_and_record_signature" as const,
    explainable: true as const,
    evidenceIds: [...evidenceIds]
  };
}
