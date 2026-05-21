import type { RuntimeScar } from "./runtime-scar.js";

export class ScarRegistry {
  private readonly scars = new Map<string, RuntimeScar>();

  remember(scar: RuntimeScar): readonly RuntimeScar[] {
    if (scar.scarId.length === 0 || scar.evidenceIds.length === 0) throw new Error("scar_registry_requires_evidence");
    if (!this.scars.has(scar.scarId)) this.scars.set(scar.scarId, { ...scar, incidentIds: [...scar.incidentIds], evidenceIds: [...scar.evidenceIds] });
    return this.list();
  }

  list(): readonly RuntimeScar[] {
    return [...this.scars.values()].sort((a, b) => a.scarId.localeCompare(b.scarId));
  }
}
