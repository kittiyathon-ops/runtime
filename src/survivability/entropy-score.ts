export function entropyScore(entropy: number, threshold: number, evidenceIds: string[]) {
  if (entropy < 0 || threshold < 0 || evidenceIds.length === 0) throw new Error("survivability_entropy_score_requires_evidence");
  return { score: entropy, status: entropy > threshold ? "ENTROPY_HIGH" as const : "ENTROPY_BOUNDED" as const, evidenceIds: [...evidenceIds] };
}
