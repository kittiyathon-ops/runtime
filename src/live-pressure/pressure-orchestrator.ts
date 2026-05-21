export function pressureOrchestrator(signals: readonly { signalId: string; status: "BOUNDED" | "UNSAFE"; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (signals.length === 0 || evidenceIds.length === 0) throw new Error("pressure_orchestrator_requires_evidence");
  const unsafe = signals.filter((signal) => {
    if (signal.signalId.length === 0 || signal.evidenceIds.length === 0) throw new Error("pressure_signal_requires_evidence");
    return signal.status === "UNSAFE";
  }).map((signal) => signal.signalId).sort();
  return { status: unsafe.length === 0 ? "PRESSURE_SURVIVED" as const : "DEGRADATION_REQUIRED" as const, unsafe, evidenceIds: [...evidenceIds] };
}
