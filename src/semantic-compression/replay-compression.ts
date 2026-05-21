export function replayCompression(seqs: readonly number[], digest: string): { firstSeq: number; lastSeq: number; count: number; digest: string; replaySafe: true } {
  if (seqs.length === 0 || digest.length === 0) throw new Error("replay_compression_requires_inputs");
  return { firstSeq: Math.min(...seqs), lastSeq: Math.max(...seqs), count: seqs.length, digest, replaySafe: true };
}
