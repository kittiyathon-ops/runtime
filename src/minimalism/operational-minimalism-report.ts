export interface MinimalismSubsystemReport {
  readonly subsystemId: string;
  readonly valueScore: number;
  readonly costScore: number;
  readonly evidenceIds: readonly string[];
}

export function operationalMinimalismReport(reports: readonly MinimalismSubsystemReport[], evidenceIds: string[]) {
  if (reports.length === 0 || evidenceIds.length === 0) throw new Error("operational_minimalism_report_requires_evidence");
  const scored = [...reports].sort((a, b) => a.subsystemId.localeCompare(b.subsystemId)).map((report) => {
    if (report.subsystemId.length === 0 || report.valueScore < 0 || report.costScore < 0 || report.evidenceIds.length === 0) throw new Error("minimalism_subsystem_report_requires_evidence");
    return { subsystemId: report.subsystemId, netScore: report.valueScore - report.costScore };
  });
  const quarantineCandidates = scored.filter((report) => report.netScore < 0).map((report) => report.subsystemId);
  return { status: quarantineCandidates.length > 0 ? "OPERATIONAL_SELF_WEIGHT_DETECTED" as const : "OPERATIONAL_MINIMALISM_BOUNDED" as const, scored, quarantineCandidates, humanReviewRequired: quarantineCandidates.length > 0, evidenceIds: [...evidenceIds] };
}
