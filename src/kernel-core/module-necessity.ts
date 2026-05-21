export type ModuleNecessityClass = "ESSENTIAL" | "OPTIONAL" | "REDUNDANT" | "REMOVAL_CANDIDATE";

export interface ModuleSurvivabilityProfile {
  readonly moduleId: string;
  readonly preserves: readonly string[];
  readonly replacementModules?: readonly string[];
  readonly runtimeSurvivesWithoutModule: boolean;
  readonly evidenceIds: readonly string[];
}

export function moduleNecessity(profile: ModuleSurvivabilityProfile, requiredKernelInvariants: readonly string[], evidenceIds: string[]) {
  if (profile.moduleId.length === 0 || profile.evidenceIds.length === 0 || requiredKernelInvariants.length === 0 || evidenceIds.length === 0) {
    throw new Error("module_necessity_requires_evidence");
  }
  const preserved = new Set(profile.preserves);
  const missing = [...requiredKernelInvariants].filter((invariant) => !preserved.has(invariant)).sort();
  const hasReplacement = (profile.replacementModules ?? []).length > 0;
  const classification: ModuleNecessityClass = profile.runtimeSurvivesWithoutModule
    ? hasReplacement ? "REDUNDANT" : "REMOVAL_CANDIDATE"
    : missing.length === 0 ? "ESSENTIAL" : "OPTIONAL";
  return {
    moduleId: profile.moduleId,
    classification,
    kernelNecessary: classification === "ESSENTIAL",
    recommendationOnly: classification !== "ESSENTIAL",
    missingKernelInvariants: missing,
    justification: classification === "ESSENTIAL" ? "module_preserves_non_removable_kernel_invariants" : "runtime_survival_without_module_requires_human_review",
    evidenceIds: [...evidenceIds, ...profile.evidenceIds].sort()
  };
}
