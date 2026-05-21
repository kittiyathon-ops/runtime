export function coherenceField(samples: readonly { domainId: string; coherence: number; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (samples.length === 0 || evidenceIds.length === 0) throw new Error("coherence_field_requires_evidence");
  const zones = samples
    .map((sample) => {
      if (sample.domainId.length === 0 || sample.coherence < 0 || sample.coherence > 1 || sample.evidenceIds.length === 0) throw new Error("coherence_sample_requires_evidence");
      return {
        domainId: sample.domainId,
        coherence: sample.coherence,
        status: sample.coherence < 0.5 ? "LOW_COHERENCE" as const : "COHERENT" as const,
        evidenceIds: [...sample.evidenceIds]
      };
    })
    .sort((a, b) => a.domainId.localeCompare(b.domainId));
  return { status: zones.some((zone) => zone.status === "LOW_COHERENCE") ? "COHERENCE_WEAK_ZONE" as const : "COHERENCE_DENSE" as const, zones, evidenceIds: [...evidenceIds] };
}
