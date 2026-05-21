export interface SandboxPolicyDecision {
  allowed: boolean;
  reason: string;
}

export class SandboxPolicy {
  evaluate(input: { layer: string; requestedMutation: boolean; sandboxed: boolean }): SandboxPolicyDecision {
    if (input.layer === "simulation") {
      return input.sandboxed
        ? { allowed: true, reason: "simulation_sandboxed" }
        : { allowed: false, reason: "simulation_requires_sandbox" };
    }
    if (input.requestedMutation && input.sandboxed) return { allowed: false, reason: "sandbox_cannot_mutate_runtime" };
    return { allowed: true, reason: "sandbox_policy_ok" };
  }
}
