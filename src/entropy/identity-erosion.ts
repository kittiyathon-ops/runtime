export function identityErosion(erosion: number, threshold: number, evidenceIds: string[]) {
  if (erosion < 0 || threshold < 0 || evidenceIds.length === 0) throw new Error("identity_erosion_requires_evidence");
  return { status: erosion > threshold ? "IDENTITY_ERODING" as const : "IDENTITY_STABLE" as const, erosion, threshold, evidenceIds: [...evidenceIds] };
}
