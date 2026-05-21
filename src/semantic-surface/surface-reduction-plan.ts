export function surfaceReductionPlan(findings: readonly { id: string; severity: "low" | "medium" | "high"; evidenceIds: readonly string[] }[], evidenceIds: string[]) {
  if (findings.length === 0 || evidenceIds.length === 0) throw new Error("surface_reduction_plan_requires_evidence");
  const recommendations = [...findings].sort((a, b) => a.id.localeCompare(b.id)).map((finding) => {
    if (finding.id.length === 0 || finding.evidenceIds.length === 0) throw new Error("surface_finding_requires_evidence");
    return { findingId: finding.id, action: finding.severity === "high" ? "REVIEW_FOR_COMPRESSION" as const : "MONITOR" as const, severity: finding.severity };
  });
  return { status: "SURFACE_REDUCTION_RECOMMENDED_ONLY" as const, recommendations, autonomousMergeAllowed: false, governanceApprovalRequired: true, evidenceIds: [...evidenceIds] };
}
