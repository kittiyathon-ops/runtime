import { operatorAction, type OperatorAction } from "./operator-actions.js";

export interface ManualApproval extends OperatorAction {
  type: "approve";
  approvedSubjectId: string;
}

export class ManualApprovalWorkflow {
  approve(input: Omit<ManualApproval, "type">): ManualApproval {
    if (input.approvedSubjectId.length === 0) throw new Error("approved_subject_required");
    return operatorAction({ ...input, type: "approve" }) as ManualApproval;
  }
}
