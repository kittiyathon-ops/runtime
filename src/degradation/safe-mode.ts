export function degradationSafeMode(required: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("degradation_safe_mode_requires_evidence");
  return { status: required ? "ENTER_SAFE_MODE" as const : "SAFE_MODE_NOT_REQUIRED" as const, evidenceIds: [...evidenceIds] };
}
