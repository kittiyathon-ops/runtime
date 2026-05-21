export function kernelDegradation(doctrineSteps: readonly string[], observedSteps: readonly string[], evidenceIds: string[]) {
  if (doctrineSteps.length === 0 || observedSteps.length === 0 || evidenceIds.length === 0) throw new Error("kernel_degradation_requires_evidence");
  const doctrine = new Set(doctrineSteps);
  const unsupported = [...observedSteps].filter((step) => !doctrine.has(step)).sort();
  return {
    status: unsupported.length === 0 ? "DEGRADATION_DOCTRINE_PRESERVED" as const : "DEGRADATION_DOCTRINE_VIOLATED" as const,
    unsupported,
    doctrineMutationAllowed: false,
    evidenceIds: [...evidenceIds]
  };
}
