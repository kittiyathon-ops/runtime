export function replayProof(valid: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("certification_replay_proof_requires_evidence");
  return { domain: "replay" as const, status: valid ? "PROVEN" as const : "FAILED" as const, evidenceIds: [...evidenceIds] };
}
