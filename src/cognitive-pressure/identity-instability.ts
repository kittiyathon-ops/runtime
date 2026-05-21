import { pressureSignal, type PressureSignal } from "./pressure-types.js";

export function identityInstability(identityDriftScore: number, lineageChanges: number, evidenceIds: string[]): PressureSignal {
  return pressureSignal("identityInstability", identityDriftScore + lineageChanges * 0.1, evidenceIds, [`identityDriftScore=${identityDriftScore}`, `lineageChanges=${lineageChanges}`]);
}
