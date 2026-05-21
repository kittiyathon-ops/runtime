export function operatorOverride(authorized: boolean, recorded: boolean, killSwitchAvailable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("operator_override_requires_evidence");
  return {
    status: authorized && recorded && killSwitchAvailable ? "OPERATOR_OVERRIDE_AVAILABLE" as const : "OPERATOR_OVERRIDE_UNSAFE" as const,
    authorized,
    recorded,
    killSwitchAvailable,
    evidenceIds: [...evidenceIds]
  };
}
