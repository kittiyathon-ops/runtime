import { pressureSignal, type PressureSignal } from "./pressure-types.js";

export function operationalFatigue(alerts: number, interventions: number, maxOperatorLoad: number, evidenceIds: string[]): PressureSignal {
  if (maxOperatorLoad <= 0) throw new Error("operator_load_invalid");
  return pressureSignal("operationalFatigue", (alerts + interventions * 3) / maxOperatorLoad, evidenceIds, [`alerts=${alerts}`, `interventions=${interventions}`]);
}
