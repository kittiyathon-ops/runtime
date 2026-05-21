import { operatorAction, type OperatorAction } from "./operator-actions.js";

export interface EmergencyIntervention extends OperatorAction {
  type: "emergency_stop";
  stopMutation: true;
}

export class EmergencyInterventionWorkflow {
  intervene(input: Omit<EmergencyIntervention, "type" | "stopMutation">): EmergencyIntervention {
    const action = operatorAction({ ...input, type: "emergency_stop" });
    return Object.freeze({ ...action, type: "emergency_stop" as const, stopMutation: true as const });
  }
}
