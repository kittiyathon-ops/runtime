export function minimalKernelIdentity(runtimeId: string, continuityHash: string, evidenceIds: string[]) {
  if (runtimeId.length === 0 || continuityHash.length === 0 || evidenceIds.length === 0) throw new Error("minimal_kernel_identity_requires_evidence");
  return { status: "KERNEL_IDENTITY_REPLAYABLE" as const, runtimeId, continuityHash, evidenceIds: [...evidenceIds] };
}
