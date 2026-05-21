import { operatorAction, type OperatorAction } from "./operator-actions.js";

export interface GovernanceOverride extends OperatorAction {
  type: "override";
  fromState: string;
  toState: string;
  policyId: string;
}

export class GovernanceOverrideWorkflow {
  override(input: Omit<GovernanceOverride, "type">): GovernanceOverride {
    if (input.policyId.length === 0) throw new Error("policy_id_required");
    return operatorAction({ ...input, type: "override" }) as GovernanceOverride;
  }
}
