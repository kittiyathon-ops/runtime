export function evidenceBootstrap(evidenceCount: number, requiredEvidenceCount: number, evidenceIds: string[]) {
  if (evidenceCount < 0 || requiredEvidenceCount < 0 || evidenceIds.length === 0) throw new Error("evidence_bootstrap_requires_evidence");
  return { status: evidenceCount >= requiredEvidenceCount ? "EVIDENCE_BOOTSTRAPPED" as const : "EVIDENCE_INSUFFICIENT" as const, evidenceCount, requiredEvidenceCount, evidenceIds: [...evidenceIds] };
}
