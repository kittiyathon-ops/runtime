import { pressureSignal, type PressureSignal } from "./pressure-types.js";

export function epistemicStress(disputedAssertions: number, unresolvedContradictions: number, totalAssertions: number, evidenceIds: string[]): PressureSignal {
  if (totalAssertions <= 0) throw new Error("assertion_count_invalid");
  const score = (disputedAssertions + unresolvedContradictions) / totalAssertions;
  return pressureSignal("epistemicStress", score, evidenceIds, [`disputed=${disputedAssertions}`, `unresolvedContradictions=${unresolvedContradictions}`]);
}
