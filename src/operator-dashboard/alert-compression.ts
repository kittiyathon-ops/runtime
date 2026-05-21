export type AlertPriority = "info" | "warning" | "critical";

export function alertCompression(alerts: readonly { alertId: string; priority: AlertPriority; evidenceIds: readonly string[] }[], evidenceIds: string[]) {
  if (alerts.length === 0 || evidenceIds.length === 0) throw new Error("alert_compression_requires_evidence");
  const priorityRank: Record<AlertPriority, number> = { info: 0, warning: 1, critical: 2 };
  const compressed = [...alerts].sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || a.alertId.localeCompare(b.alertId)).map((alert) => {
    if (alert.alertId.length === 0 || alert.evidenceIds.length === 0) throw new Error("alert_requires_evidence");
    return alert.alertId;
  });
  return { status: "ALERTS_COMPRESSED_FOR_OPERATOR" as const, compressed, evidenceIds: [...evidenceIds] };
}
