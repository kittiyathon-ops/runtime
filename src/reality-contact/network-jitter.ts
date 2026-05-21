export function networkJitter(jitterMs: number, maxJitterMs: number, evidenceIds: string[]) {
  if (jitterMs < 0 || maxJitterMs < 0 || evidenceIds.length === 0) throw new Error("network_jitter_requires_evidence");
  return { status: jitterMs > maxJitterMs ? "NETWORK_JITTER_DETECTED" as const : "NETWORK_JITTER_BOUNDED" as const, jitterMs, maxJitterMs, evidenceIds: [...evidenceIds] };
}
