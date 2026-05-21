export function operatorFatigue(interventions: number, windowLimit: number, evidenceIds: string[]) {
  if (interventions < 0 || windowLimit < 0 || evidenceIds.length === 0) throw new Error("operator_fatigue_requires_evidence");
  return { status: interventions > windowLimit ? "FATIGUE_RISK" as const : "FATIGUE_BOUNDED" as const, interventions, windowLimit, evidenceIds: [...evidenceIds] };
}
