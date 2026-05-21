export function burnInCertification(noCrash: boolean, noReplayDivergence: boolean, noOntologyInflation: boolean, survivabilityStable: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("burn_in_certification_requires_evidence");
  const passed = noCrash && noReplayDivergence && noOntologyInflation && survivabilityStable;
  return { status: passed ? "BURN_IN_CERTIFIED" as const : "BURN_IN_NOT_CERTIFIED" as const, autonomyIncreaseAllowed: passed, noCrash, noReplayDivergence, noOntologyInflation, survivabilityStable, evidenceIds: [...evidenceIds] };
}
