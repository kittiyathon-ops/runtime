export function authorityContinuity(previous: string, current: string, evidenceIds: string[]) {
  if (previous.length === 0 || current.length === 0 || evidenceIds.length === 0) throw new Error("authority_continuity_requires_evidence");
  return { status: previous === current ? "CONTINUOUS" as const : "DISCONTINUOUS" as const, evidenceIds: [...evidenceIds] };
}
