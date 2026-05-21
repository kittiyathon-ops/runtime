export interface LongHorizonInputs {
  readonly days: number;
  readonly semanticDrift: number;
  readonly maxSemanticDrift: number;
  readonly replayEventsPerDay: number;
  readonly maxReplayEventsPerDay: number;
  readonly governanceRot: number;
  readonly maxGovernanceRot: number;
  readonly memoryGrowthPerDay: number;
  readonly maxMemoryGrowthPerDay: number;
  readonly ontologyGrowthPerDay: number;
  readonly maxOntologyGrowthPerDay: number;
  readonly identityContinuity: boolean;
  readonly operationalTruthPreserved: boolean;
  readonly recoveryCapabilityPreserved: boolean;
}

export function longHorizonSimulation(input: LongHorizonInputs, evidenceIds: string[]) {
  if (input.days <= 0 || evidenceIds.length === 0) throw new Error("long_horizon_simulation_requires_evidence");
  const bounded = input.semanticDrift <= input.maxSemanticDrift
    && input.replayEventsPerDay <= input.maxReplayEventsPerDay
    && input.governanceRot <= input.maxGovernanceRot
    && input.memoryGrowthPerDay <= input.maxMemoryGrowthPerDay
    && input.ontologyGrowthPerDay <= input.maxOntologyGrowthPerDay
    && input.identityContinuity
    && input.operationalTruthPreserved
    && input.recoveryCapabilityPreserved;
  return { status: bounded ? "LONG_HORIZON_SURVIVABLE" as const : "LONG_HORIZON_DEGRADATION_DETECTED" as const, days: input.days, bounded, evidenceIds: [...evidenceIds] };
}
