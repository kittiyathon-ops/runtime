import { KERNEL_INVARIANTS, type KernelInvariantCheck, kernelInvariants } from "./kernel-invariants.js";
import { type ModuleSurvivabilityProfile, moduleNecessity } from "./module-necessity.js";

export function kernelCore(modules: readonly ModuleSurvivabilityProfile[], checks: readonly KernelInvariantCheck[], evidenceIds: string[]) {
  if (modules.length === 0 || checks.length === 0 || evidenceIds.length === 0) throw new Error("kernel_core_requires_evidence");
  const invariants = kernelInvariants(checks, evidenceIds);
  const classifications = [...modules]
    .sort((a, b) => a.moduleId.localeCompare(b.moduleId))
    .map((module) => moduleNecessity(module, KERNEL_INVARIANTS, evidenceIds));
  return {
    status: invariants.status === "KERNEL_INVARIANTS_PRESERVED" ? "SURVIVABILITY_KERNEL_EXTRACTED" as const : "SURVIVABILITY_KERNEL_REJECTED" as const,
    invariantStatus: invariants.status,
    classifications,
    automaticDeletionAllowed: false,
    evidenceIds: [...evidenceIds]
  };
}
