import { pressureSignal, type PressureSignal } from "./pressure-types.js";

export function coherenceDecay(previousCoherence: number, currentCoherence: number, evidenceIds: string[]): PressureSignal {
  if (previousCoherence <= 0 || currentCoherence < 0) throw new Error("coherence_score_invalid");
  return pressureSignal("coherenceDecay", Math.max(0, previousCoherence - currentCoherence), evidenceIds, [`previous=${previousCoherence}`, `current=${currentCoherence}`]);
}
