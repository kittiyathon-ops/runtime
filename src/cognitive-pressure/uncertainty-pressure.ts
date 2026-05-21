import { pressureSignal, type PressureSignal } from "./pressure-types.js";

export function uncertaintyPressure(unknowns: number, lowConfidenceAssertions: number, totalSignals: number, evidenceIds: string[]): PressureSignal {
  if (totalSignals <= 0) throw new Error("signal_count_invalid");
  return pressureSignal("uncertaintyPressure", (unknowns + lowConfidenceAssertions) / totalSignals, evidenceIds, [`unknowns=${unknowns}`, `lowConfidence=${lowConfidenceAssertions}`]);
}
