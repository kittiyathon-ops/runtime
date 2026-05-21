export function semanticDensityMap(zones: readonly { domainId: string; abstractionCount: number; executionValue: number; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (zones.length === 0 || evidenceIds.length === 0) throw new Error("semantic_density_map_requires_evidence");
  const mapped = zones
    .map((zone) => {
      if (zone.domainId.length === 0 || zone.abstractionCount < 0 || zone.executionValue < 0 || zone.evidenceIds.length === 0) throw new Error("semantic_density_zone_requires_evidence");
      const density = zone.executionValue === 0 ? zone.abstractionCount : zone.abstractionCount / zone.executionValue;
      return { domainId: zone.domainId, density, status: density > 3 ? "SEMANTIC_OVERLOAD" as const : "SEMANTIC_BOUNDED" as const, evidenceIds: [...zone.evidenceIds] };
    })
    .sort((a, b) => a.domainId.localeCompare(b.domainId));
  return { status: mapped.some((zone) => zone.status === "SEMANTIC_OVERLOAD") ? "OVERLOAD_FORMING" as const : "SEMANTIC_DENSITY_BOUNDED" as const, zones: mapped, evidenceIds: [...evidenceIds] };
}
