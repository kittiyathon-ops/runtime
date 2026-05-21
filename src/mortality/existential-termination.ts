export interface ExistentialTerminationInput {
  constitutionalDeath: boolean;
  terminalContinuityPreserved: boolean;
  finalTruthRecorded: boolean;
  identityPreserved: boolean;
  governanceLineagePreserved: boolean;
  evidenceIds: string[];
}

export function existentialTermination(input: ExistentialTerminationInput) {
  if (input.evidenceIds.length === 0) throw new Error("existential_termination_requires_evidence");
  const coherent = input.constitutionalDeath &&
    input.terminalContinuityPreserved &&
    input.finalTruthRecorded &&
    input.identityPreserved &&
    input.governanceLineagePreserved;
  return {
    status: coherent ? "COHERENT_TERMINATION" as const : "TERMINATION_UNSAFE" as const,
    preserveLineage: true as const,
    operationMayContinue: false as const,
    evidenceIds: [...input.evidenceIds]
  };
}
