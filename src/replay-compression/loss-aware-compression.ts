export function lossAwareCompression(preservedMeaning: readonly string[], declaredLosses: readonly string[], evidenceIds: string[]) {
  if (preservedMeaning.length === 0 || evidenceIds.length === 0) throw new Error("replay_loss_aware_compression_requires_evidence");
  return {
    status: declaredLosses.length === 0 ? "REPLAY_COMPRESSION_LOSSLESS" as const : "REPLAY_COMPRESSION_LOSS_DECLARED" as const,
    preservedMeaning: [...preservedMeaning].sort(),
    declaredLosses: [...declaredLosses].sort(),
    evidenceIds: [...evidenceIds]
  };
}
