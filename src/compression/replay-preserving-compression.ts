export function replayPreservingCompression(beforeDigest: string, afterDigest: string, evidenceIds: string[]) {
  if (beforeDigest.length === 0 || afterDigest.length === 0 || evidenceIds.length === 0) throw new Error("replay_compression_requires_evidence");
  return { status: beforeDigest === afterDigest ? "REPLAY_PRESERVED" as const : "REPLAY_BROKEN" as const, evidenceIds: [...evidenceIds] };
}
