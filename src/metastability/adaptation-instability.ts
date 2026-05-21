export function adaptationInstability(changes: number, window: number, evidenceIds: string[]) {
  if (window <= 0 || evidenceIds.length === 0) throw new Error("adaptation_instability_requires_evidence");
  const rate = changes / window;
  return { status: rate >= 0.5 ? "UNSTABLE" as const : "STABLE" as const, rate, evidenceIds: [...evidenceIds] };
}
