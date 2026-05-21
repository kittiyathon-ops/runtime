export function memoryGrowth(samples: readonly number[], maxGrowthBytes: number, evidenceIds: string[]) {
  if (samples.length < 2 || maxGrowthBytes < 0 || evidenceIds.length === 0) throw new Error("memory_growth_requires_evidence");
  if (samples.some((sample) => sample < 0)) throw new Error("memory_growth_sample_invalid");
  const growthBytes = samples[samples.length - 1]! - samples[0]!;
  return {
    status: growthBytes <= maxGrowthBytes ? "MEMORY_GROWTH_BOUNDED" as const : "MEMORY_SATURATION_RISK" as const,
    growthBytes,
    maxGrowthBytes,
    sampleCount: samples.length,
    evidenceIds: [...evidenceIds]
  };
}
