export function staleListenKey(ageMs: number, maxAgeMs: number, renewed: boolean, evidenceIds: string[]) {
  if (ageMs < 0 || maxAgeMs < 0 || evidenceIds.length === 0) throw new Error("stale_listen_key_requires_evidence");
  const stale = ageMs > maxAgeMs && !renewed;
  return { status: stale ? "STALE_LISTEN_KEY_DETECTED" as const : "LISTEN_KEY_VALID" as const, ageMs, maxAgeMs, renewed, action: stale ? "RENEW_AND_RECONNECT" as const : "MONITOR" as const, evidenceIds: [...evidenceIds] };
}
