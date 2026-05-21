export interface ConstitutionalPressureReport {
  status: "LOW" | "HIGH" | "CRITICAL";
  score: number;
  evidenceIds: string[];
}

export function constitutionalPressure(breaches: number, validations: number, evidenceIds: string[]): ConstitutionalPressureReport {
  if (validations <= 0) throw new Error("constitutional_validation_count_invalid");
  const score = Math.min(1, breaches / validations);
  return { status: score >= 0.5 ? "CRITICAL" : score > 0 ? "HIGH" : "LOW", score, evidenceIds: [...evidenceIds] };
}
