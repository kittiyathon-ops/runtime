export function survivableState(essentialCount: number, maxEssentialCount: number, killSwitchAvailable: boolean, evidenceIds: string[]) {
  if (essentialCount < 0 || maxEssentialCount < 0 || evidenceIds.length === 0) throw new Error("survivable_state_requires_evidence");
  return {
    status: essentialCount <= maxEssentialCount && killSwitchAvailable ? "STATE_SURVIVABLE" as const : "STATE_NOT_SURVIVABLE" as const,
    essentialCount,
    maxEssentialCount,
    killSwitchAvailable,
    evidenceIds: [...evidenceIds]
  };
}
