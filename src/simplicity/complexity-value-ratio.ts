export interface ComplexityValueInput {
  conceptValue: number;
  operationalValue: number;
  testValue: number;
  recoveryValue: number;
  governanceValue: number;
  explainabilityValue: number;
  complexityCost: number;
  maintenanceCost: number;
  cognitiveBurden: number;
  recursionRisk: number;
  evidenceIds: string[];
}

export function complexityValueRatio(input: ComplexityValueInput) {
  if (input.evidenceIds.length === 0) throw new Error("complexity_value_ratio_requires_evidence");
  const value = input.conceptValue + input.operationalValue + input.testValue + input.recoveryValue + input.governanceValue + input.explainabilityValue;
  const cost = input.complexityCost + input.maintenanceCost + input.cognitiveBurden + input.recursionRisk;
  const ratio = cost === 0 ? value : value / cost;
  return {
    status: ratio >= 1 ? "VALUE_JUSTIFIED" as const : "VALUE_DEFICIENT" as const,
    value,
    cost,
    ratio,
    evidenceIds: [...input.evidenceIds]
  };
}
