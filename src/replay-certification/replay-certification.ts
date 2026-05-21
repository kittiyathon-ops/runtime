export interface ReplayCertificationCheck {
  readonly checkId: string;
  readonly passed: boolean;
  readonly evidenceIds: readonly string[];
}

export function replayCertification(checks: readonly ReplayCertificationCheck[], evidenceIds: string[]) {
  if (checks.length === 0 || evidenceIds.length === 0) throw new Error("replay_certification_requires_evidence");
  const failed = checks.filter((check) => !check.passed).map((check) => check.checkId);
  return {
    status: failed.length === 0 ? "REPLAY_CERTIFIED" as const : "REPLAY_CERTIFICATION_REJECTED" as const,
    failed,
    evidenceIds: [...evidenceIds]
  };
}
