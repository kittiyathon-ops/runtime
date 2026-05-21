export type PressureLevel = "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
export type PressureRecommendation = "CONTINUE" | "THROTTLE_COGNITION" | "SAFE_MODE" | "HALT";

export interface PressureSignal {
  name: string;
  score: number;
  level: PressureLevel;
  evidenceIds: string[];
  explanation: string[];
}

export function clampScore(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("pressure_score_invalid");
  return Math.min(1, value);
}

export function pressureLevel(score: number): PressureLevel {
  const normalized = clampScore(score);
  if (normalized >= 0.9) return "CRITICAL";
  if (normalized >= 0.7) return "HIGH";
  if (normalized >= 0.4) return "ELEVATED";
  return "LOW";
}

export function pressureRecommendation(score: number): PressureRecommendation {
  const level = pressureLevel(score);
  if (level === "CRITICAL") return "HALT";
  if (level === "HIGH") return "SAFE_MODE";
  if (level === "ELEVATED") return "THROTTLE_COGNITION";
  return "CONTINUE";
}

export function pressureSignal(name: string, score: number, evidenceIds: string[], explanation: string[]): PressureSignal {
  if (name.length === 0) throw new Error("pressure_name_required");
  if (evidenceIds.length === 0 || explanation.length === 0) throw new Error("pressure_requires_evidence_and_explanation");
  const normalized = clampScore(score);
  return Object.freeze({ name, score: normalized, level: pressureLevel(normalized), evidenceIds: [...evidenceIds], explanation: [...explanation] });
}
