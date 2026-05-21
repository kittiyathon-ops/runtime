export function alertPrioritization(alerts: readonly { alertId: string; severity: number; survivabilityImpact: number; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (alerts.length === 0 || evidenceIds.length === 0) throw new Error("alert_prioritization_requires_evidence");
  const ranked = alerts.map((alert) => {
    if (alert.alertId.length === 0 || alert.evidenceIds.length === 0) throw new Error("alert_requires_evidence");
    return { alertId: alert.alertId, priority: alert.severity + alert.survivabilityImpact, evidenceIds: [...alert.evidenceIds] };
  }).sort((a, b) => b.priority - a.priority || a.alertId.localeCompare(b.alertId));
  return { status: "ALERTS_PRIORITIZED" as const, ranked, evidenceIds: [...evidenceIds] };
}
