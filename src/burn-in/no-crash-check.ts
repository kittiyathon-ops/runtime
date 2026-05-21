export function noCrashCheck(crashCount: number, observedHours: number, evidenceIds: string[]) {
  if (crashCount < 0 || observedHours < 0 || evidenceIds.length === 0) throw new Error("no_crash_check_requires_evidence");
  return { status: crashCount === 0 && observedHours >= 24 ? "NO_CRASH_24H_PASSED" as const : "NO_CRASH_24H_FAILED" as const, crashCount, observedHours, evidenceIds: [...evidenceIds] };
}
