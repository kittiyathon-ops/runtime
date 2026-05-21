import { complexityValueRatio, type ComplexityValueInput } from "./complexity-value-ratio.js";

export interface RemovalCandidate extends ComplexityValueInput {
  conceptId: string;
  removalPreservesContinuity: boolean;
  removalPreservesReplay: boolean;
  removalPreservesExplainability: boolean;
  reversible: boolean;
}

export function removalCandidates(candidates: readonly RemovalCandidate[], evidenceIds: string[]) {
  if (candidates.length === 0 || evidenceIds.length === 0) throw new Error("removal_candidates_require_evidence");
  const evaluated = candidates
    .map((candidate) => {
      if (candidate.conceptId.length === 0 || candidate.evidenceIds.length === 0) throw new Error("removal_candidate_requires_evidence");
      const ratio = complexityValueRatio(candidate);
      const removable = ratio.status === "VALUE_DEFICIENT" &&
        candidate.removalPreservesContinuity &&
        candidate.removalPreservesReplay &&
        candidate.removalPreservesExplainability &&
        candidate.reversible;
      return {
        conceptId: candidate.conceptId,
        status: removable ? "REMOVAL_CANDIDATE" as const : "RETAIN" as const,
        ratio: ratio.ratio,
        reversible: candidate.reversible,
        evidenceIds: [...candidate.evidenceIds]
      };
    })
    .sort((a, b) => a.conceptId.localeCompare(b.conceptId));
  return { status: "REMOVAL_EVALUATED" as const, evaluated, evidenceIds: [...evidenceIds] };
}
