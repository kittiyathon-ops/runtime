import { pressureSignal, type PressureSignal } from "./pressure-types.js";

export function adaptationPressure(policyChanges: number, doctrineChanges: number, windowEvents: number, evidenceIds: string[]): PressureSignal {
  if (windowEvents <= 0) throw new Error("pressure_window_invalid");
  const score = (policyChanges + doctrineChanges * 2) / windowEvents;
  return pressureSignal("adaptationPressure", score, evidenceIds, [`policyChanges=${policyChanges}`, `doctrineChanges=${doctrineChanges}`, `windowEvents=${windowEvents}`]);
}
