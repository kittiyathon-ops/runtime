export function incidentImpact(affectedOrders: number, affectedExposure: number, operatorImpact: "none" | "low" | "medium" | "high", evidenceIds: string[]) {
  if (affectedOrders < 0 || affectedExposure < 0 || evidenceIds.length === 0) throw new Error("incident_impact_requires_evidence");
  const material = affectedOrders > 0 || affectedExposure > 0 || operatorImpact === "high";
  return { status: material ? "INCIDENT_IMPACT_MATERIAL" as const : "INCIDENT_IMPACT_CONTAINED" as const, affectedOrders, affectedExposure, operatorImpact, evidenceIds: [...evidenceIds] };
}
