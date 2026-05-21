import { type LongHorizonInputs, longHorizonSimulation } from "./long-horizon-simulation.js";

export function oneYearRun(input: Omit<LongHorizonInputs, "days">, evidenceIds: string[]) {
  return longHorizonSimulation({ ...input, days: 365 }, evidenceIds);
}
