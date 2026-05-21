export function survivabilityCertifier(proofs: readonly { domain: string; status: "PROVEN" | "FAILED"; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (proofs.length === 0 || evidenceIds.length === 0) throw new Error("survivability_certifier_requires_evidence");
  const failed = proofs.filter((proof) => proof.status === "FAILED").map((proof) => proof.domain).sort();
  return { status: failed.length === 0 ? "SURVIVABILITY_CERTIFIED" as const : "SURVIVABILITY_CERTIFICATION_FAILED" as const, failed, evidenceIds: [...evidenceIds] };
}
