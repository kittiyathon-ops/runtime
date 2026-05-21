export function continuityProof(continuous: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("certification_continuity_proof_requires_evidence");
  return { domain: "continuity" as const, status: continuous ? "PROVEN" as const : "FAILED" as const, evidenceIds: [...evidenceIds] };
}
