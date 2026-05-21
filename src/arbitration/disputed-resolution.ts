export function disputedResolution(disputeId: string, resolution: string, evidenceIds: string[]) {
  if (disputeId.length === 0 || resolution.length === 0 || evidenceIds.length === 0) throw new Error("disputed_resolution_requires_evidence");
  return { disputeId, resolution, preserveHistory: true as const, evidenceIds: [...evidenceIds] };
}
