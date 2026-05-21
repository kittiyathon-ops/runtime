export interface ConstitutionalFailureInput {
  doctrineErosion: boolean;
  governanceIllegitimacy: boolean;
  continuityCollapse: boolean;
  existentialDiscontinuity: boolean;
  authorityFracture: boolean;
  evidenceIds: string[];
}

export function constitutionalFailure(input: ConstitutionalFailureInput) {
  if (input.evidenceIds.length === 0) throw new Error("constitutional_failure_requires_evidence");
  const causes = [
    input.doctrineErosion ? "doctrine_erosion" : "",
    input.governanceIllegitimacy ? "governance_illegitimacy" : "",
    input.continuityCollapse ? "continuity_collapse" : "",
    input.existentialDiscontinuity ? "existential_discontinuity" : "",
    input.authorityFracture ? "authority_fracture" : ""
  ].filter((cause) => cause.length > 0).sort();
  return {
    status: causes.length > 0 ? "CONSTITUTIONAL_DEATH" as const : "LEGITIMATE" as const,
    causes,
    terminateAuthority: causes.length > 0,
    evidenceIds: [...input.evidenceIds]
  };
}
