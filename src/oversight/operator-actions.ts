export type OperatorActionType = "approve" | "override" | "emergency_stop" | "inspect" | "release_quarantine";

export interface OperatorAction {
  actionId: string;
  type: OperatorActionType;
  operatorId: string;
  timestamp: number;
  traceId: string;
  reason: string;
  provenanceIds: string[];
}

export function operatorAction(input: OperatorAction): OperatorAction {
  if (input.operatorId.length === 0) throw new Error("operator_id_required");
  if (input.traceId.length === 0) throw new Error("trace_id_required");
  if (input.provenanceIds.length === 0) throw new Error("operator_action_requires_provenance");
  return Object.freeze({ ...input });
}
