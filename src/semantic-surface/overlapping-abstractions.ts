export interface AbstractionProfile {
  readonly abstractionId: string;
  readonly responsibilities: readonly string[];
  readonly evidenceIds: readonly string[];
}

export function overlappingAbstractions(abstractions: readonly AbstractionProfile[], overlapThreshold: number, evidenceIds: string[]) {
  if (abstractions.length < 2 || overlapThreshold < 0 || overlapThreshold > 1 || evidenceIds.length === 0) throw new Error("overlapping_abstractions_require_evidence");
  const findings: { abstractionA: string; abstractionB: string; overlapRatio: number; sharedResponsibilities: string[] }[] = [];
  const sorted = [...abstractions].sort((a, b) => a.abstractionId.localeCompare(b.abstractionId));
  for (const abstraction of sorted) {
    if (abstraction.abstractionId.length === 0 || abstraction.responsibilities.length === 0 || abstraction.evidenceIds.length === 0) throw new Error("abstraction_profile_requires_evidence");
  }
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      const a = sorted[left]!;
      const b = sorted[right]!;
      const sharedResponsibilities = a.responsibilities.filter((responsibility) => b.responsibilities.includes(responsibility)).sort();
      const unionSize = new Set([...a.responsibilities, ...b.responsibilities]).size;
      const overlapRatio = unionSize === 0 ? 0 : sharedResponsibilities.length / unionSize;
      if (overlapRatio >= overlapThreshold) findings.push({ abstractionA: a.abstractionId, abstractionB: b.abstractionId, overlapRatio, sharedResponsibilities });
    }
  }
  return { status: findings.length > 0 ? "OVERLAPPING_ABSTRACTIONS_DETECTED" as const : "ABSTRACTIONS_DISTINCT" as const, findings, recommendationOnly: true, evidenceIds: [...evidenceIds] };
}
