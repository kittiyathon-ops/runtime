import { type LongHorizonInputs, longHorizonSimulation } from "./long-horizon-simulation.js";

export function thirtyDayRun(input: Omit<LongHorizonInputs, "days">, evidenceIds: string[]) {
  return longHorizonSimulation({ ...input, days: 30 }, evidenceIds);
}
