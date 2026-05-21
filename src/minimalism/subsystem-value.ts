export function subsystemValue(survivability: number, replay: number, governance: number, recovery: number, explainability: number, evidenceIds: string[]) {
  if ([survivability, replay, governance, recovery, explainability].some((value) => value < 0) || evidenceIds.length === 0) throw new Error("subsystem_value_requires_evidence");
  return { score: survivability + replay + governance + recovery + explainability, survivability, replay, governance, recovery, explainability, evidenceIds: [...evidenceIds] };
}
