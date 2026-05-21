export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL" | "FATAL";

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2,
  FATAL: 3
};

export function compareSeverity(left: AlertSeverity, right: AlertSeverity): number {
  return SEVERITY_RANK[left] - SEVERITY_RANK[right];
}

