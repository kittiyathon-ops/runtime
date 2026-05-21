export function operatorCognition(explanationItems: number, causalDepth: number, maxItems: number, maxDepth: number, evidenceIds: string[]) {
  if (explanationItems < 0 || causalDepth < 0 || maxItems <= 0 || maxDepth <= 0 || evidenceIds.length === 0) throw new Error("operator_cognition_requires_evidence");
  const overloaded = explanationItems > maxItems || causalDepth > maxDepth;
  return { status: overloaded ? "OPERATOR_OVERLOADED" as const : "OPERATOR_INTERPRETABLE" as const, explanationItems, causalDepth, maxItems, maxDepth, evidenceIds: [...evidenceIds] };
}
