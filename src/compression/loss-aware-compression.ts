export function lossAwareCompression(preserved: readonly string[], lost: readonly string[], evidenceIds: string[]) {
  if (preserved.length === 0 || evidenceIds.length === 0) throw new Error("loss_aware_compression_requires_evidence");
  return { status: lost.length === 0 ? "LOSSLESS" as const : "LOSS_DECLARED" as const, preserved: [...preserved].sort(), lost: [...lost].sort(), evidenceIds: [...evidenceIds] };
}
