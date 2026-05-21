export function operatorCognitiveLoad(alerts: number, explanations: number, maxLoad: number, evidenceIds: string[]) {
  if (alerts < 0 || explanations < 0 || maxLoad <= 0 || evidenceIds.length === 0) throw new Error("operator_cognitive_load_requires_evidence");
  const load = alerts + explanations * 2;
  return { status: load <= maxLoad ? "LOAD_BOUNDED" as const : "LOAD_EXCESSIVE" as const, load, maxLoad, evidenceIds: [...evidenceIds] };
}
