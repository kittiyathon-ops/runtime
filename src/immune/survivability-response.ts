export function survivabilityResponse(infectionScore: number, nonSelf: boolean, evidenceIds: string[]) {
  if (infectionScore < 0 || infectionScore > 1 || evidenceIds.length === 0) throw new Error("survivability_response_requires_evidence");
  if (infectionScore >= 0.7 || nonSelf) return { action: "QUARANTINE" as const, evidenceIds: [...evidenceIds] };
  if (infectionScore > 0) return { action: "THROTTLE_COGNITION" as const, evidenceIds: [...evidenceIds] };
  return { action: "ALLOW" as const, evidenceIds: [...evidenceIds] };
}
