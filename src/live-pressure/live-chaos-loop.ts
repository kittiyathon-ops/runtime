export interface ChaosStep {
  seq: number;
  scenarioId: string;
  severity: number;
  evidenceIds: string[];
}

export function liveChaosLoop(steps: readonly ChaosStep[], maxSeverity: number, evidenceIds: string[]) {
  if (steps.length === 0 || maxSeverity < 0 || evidenceIds.length === 0) throw new Error("live_chaos_loop_requires_evidence");
  const ordered = [...steps].sort((a, b) => a.seq - b.seq);
  const bounded = ordered.every((step, index) => {
    if (step.seq < 0 || step.scenarioId.length === 0 || step.severity < 0 || step.evidenceIds.length === 0) throw new Error("live_chaos_step_requires_evidence");
    return step.severity <= maxSeverity && (index === 0 || step.seq >= ordered[index - 1]!.seq);
  });
  return {
    status: bounded ? "CHAOS_LOOP_BOUNDED" as const : "CHAOS_LOOP_UNSAFE" as const,
    schedule: ordered.map((step) => step.scenarioId),
    maxSeverity,
    replaySafe: bounded,
    evidenceIds: [...evidenceIds]
  };
}
