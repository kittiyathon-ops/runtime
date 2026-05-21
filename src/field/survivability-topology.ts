export function survivabilityTopology(components: readonly { componentId: string; continuityCriticality: number; redundancy: number; evidenceIds: string[] }[], evidenceIds: string[]) {
  if (components.length === 0 || evidenceIds.length === 0) throw new Error("survivability_topology_requires_evidence");
  const mapped = components
    .map((component) => {
      if (component.componentId.length === 0 || component.continuityCriticality < 0 || component.continuityCriticality > 1 || component.redundancy < 0 || component.evidenceIds.length === 0) throw new Error("survivability_component_requires_evidence");
      const singlePointRisk = component.continuityCriticality >= 0.8 && component.redundancy === 0;
      return { componentId: component.componentId, singlePointRisk, continuityCriticality: component.continuityCriticality, redundancy: component.redundancy, evidenceIds: [...component.evidenceIds] };
    })
    .sort((a, b) => a.componentId.localeCompare(b.componentId));
  return { status: mapped.some((component) => component.singlePointRisk) ? "EXISTENTIAL_SINGLE_POINT_RISK" as const : "TOPOLOGY_RESILIENT" as const, components: mapped, evidenceIds: [...evidenceIds] };
}
