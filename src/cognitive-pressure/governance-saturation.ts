import { pressureSignal, type PressureSignal } from "./pressure-types.js";

export function governanceSaturation(activeReviews: number, overrides: number, maxGovernanceLoad: number, evidenceIds: string[]): PressureSignal {
  if (maxGovernanceLoad <= 0) throw new Error("governance_load_invalid");
  return pressureSignal("governanceSaturation", (activeReviews + overrides * 2) / maxGovernanceLoad, evidenceIds, [`activeReviews=${activeReviews}`, `overrides=${overrides}`]);
}
