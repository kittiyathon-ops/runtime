import { pressureSignal, type PressureSignal } from "./pressure-types.js";

export function contradictionDensity(contradictions: number, evidenceCount: number, evidenceIds: string[]): PressureSignal {
  if (evidenceCount <= 0) throw new Error("evidence_count_invalid");
  return pressureSignal("contradictionDensity", contradictions / evidenceCount, evidenceIds, [`contradictions=${contradictions}`, `evidenceCount=${evidenceCount}`]);
}
