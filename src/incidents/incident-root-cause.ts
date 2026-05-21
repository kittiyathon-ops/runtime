export function incidentRootCause(category: string, description: string, confidence: number, evidenceIds: string[]) {
  if (category.length === 0 || description.length === 0 || confidence < 0 || confidence > 1 || evidenceIds.length === 0) throw new Error("incident_root_cause_requires_evidence");
  return { status: confidence >= 0.5 ? "ROOT_CAUSE_IDENTIFIED" as const : "ROOT_CAUSE_UNCERTAIN" as const, category, description, confidence, evidenceIds: [...evidenceIds] };
}
