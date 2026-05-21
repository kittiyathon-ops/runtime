import { governanceLoadBudget } from "./governance-load-budget.js";

export interface GovernanceLoadInput {
  activeGovernanceActions: number;
  activeOverrides: number;
  maxGovernanceLoad: number;
  evidenceIds: string[];
}

export function governanceLoad(input: GovernanceLoadInput) {
  return governanceLoadBudget(input.activeGovernanceActions + input.activeOverrides * 2, input.maxGovernanceLoad, input.evidenceIds);
}
