export function recoverySeed(identityDigest: string, timelineDigest: string, governanceDigest: string, replayDigest: string, evidenceIds: string[]) {
  if (identityDigest.length === 0 || timelineDigest.length === 0 || governanceDigest.length === 0 || replayDigest.length === 0 || evidenceIds.length === 0) throw new Error("recovery_seed_requires_evidence");
  return {
    status: "RECOVERY_SEED_READY" as const,
    identityDigest,
    timelineDigest,
    governanceDigest,
    replayDigest,
    evidenceIds: [...evidenceIds]
  };
}
