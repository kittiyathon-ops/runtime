export function survivabilityValue(identity: number, replay: number, governance: number, recovery: number, evidenceIds: string[]) {
  if ([identity, replay, governance, recovery].some((value) => value < 0) || evidenceIds.length === 0) throw new Error("survivability_value_requires_evidence");
  return { score: identity + replay + governance + recovery, identity, replay, governance, recovery, evidenceIds: [...evidenceIds] };
}
