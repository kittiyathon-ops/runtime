import { type LongHorizonInputs, longHorizonSimulation } from "./long-horizon-simulation.js";

export function ninetyDayRun(input: Omit<LongHorizonInputs, "days">, evidenceIds: string[]) {
  return longHorizonSimulation({ ...input, days: 90 }, evidenceIds);
}
