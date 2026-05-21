export interface RuntimeScar {
  readonly scarId: string;
  readonly pattern: string;
  readonly incidentIds: readonly string[];
  readonly recommendedCheck: string;
  readonly evidenceIds: readonly string[];
}

export function runtimeScar(scar: RuntimeScar, evidenceIds: string[]) {
  if (scar.scarId.length === 0 || scar.pattern.length === 0 || scar.incidentIds.length === 0 || scar.recommendedCheck.length === 0 || scar.evidenceIds.length === 0 || evidenceIds.length === 0) {
    throw new Error("runtime_scar_requires_evidence");
  }
  return { status: "RUNTIME_SCAR_RECORDED" as const, scar: { ...scar, incidentIds: [...scar.incidentIds].sort(), evidenceIds: [...scar.evidenceIds] }, doctrineMutated: false, evidenceIds: [...evidenceIds] };
}
