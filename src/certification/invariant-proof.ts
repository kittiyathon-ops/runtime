export function invariantProof(preserved: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("certification_invariant_proof_requires_evidence");
  return { domain: "invariants" as const, status: preserved ? "PROVEN" as const : "FAILED" as const, evidenceIds: [...evidenceIds] };
}
