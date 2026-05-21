export function kernelIdentity(runtimeId: string, continuityHash: string, evidenceIds: string[]) {
  if (runtimeId.length === 0 || continuityHash.length === 0 || evidenceIds.length === 0) throw new Error("kernel_identity_requires_evidence");
  return Object.freeze({ runtimeId, continuityHash, replaySafe: true as const, evidenceIds: [...evidenceIds] });
}
