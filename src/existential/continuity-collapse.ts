export function continuityCollapse(identity: boolean, doctrine: boolean, causal: boolean, governance: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("continuity_collapse_requires_evidence");
  const failed = [
    identity ? "" : "identity",
    doctrine ? "" : "doctrine",
    causal ? "" : "causal",
    governance ? "" : "governance"
  ].filter((item) => item.length > 0);
  return { status: failed.length > 0 ? "COLLAPSED" as const : "CONTINUOUS" as const, failed, evidenceIds: [...evidenceIds] };
}
