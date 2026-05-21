import { pressureSignal, type PressureSignal } from "./pressure-types.js";

export function trustFracture(quarantinedSources: number, degradedSources: number, totalSources: number, evidenceIds: string[]): PressureSignal {
  if (totalSources <= 0) throw new Error("source_count_invalid");
  return pressureSignal("trustFracture", (quarantinedSources + degradedSources * 0.5) / totalSources, evidenceIds, [`quarantined=${quarantinedSources}`, `degraded=${degradedSources}`]);
}
