export function kernelReplay(sourceHash: string, replayHash: string, causalOrderPreserved: boolean, evidenceIds: string[]) {
  if (sourceHash.length === 0 || replayHash.length === 0 || evidenceIds.length === 0) throw new Error("kernel_replay_requires_evidence");
  const deterministic = sourceHash === replayHash && causalOrderPreserved;
  return {
    status: deterministic ? "REPLAY_INTEGRITY_PRESERVED" as const : "REPLAY_INTEGRITY_REJECTED" as const,
    deterministic,
    causalOrderPreserved,
    evidenceIds: [...evidenceIds]
  };
}
