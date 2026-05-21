import type { CapabilityLayer } from "./permission-matrix.js";

export interface BoundaryCheck {
  from: CapabilityLayer;
  to: CapabilityLayer;
  mutation: boolean;
  allowed: boolean;
  reason: string;
}

export class IsolationBoundaries {
  check(from: CapabilityLayer, to: CapabilityLayer, mutation: boolean): BoundaryCheck {
    const sameLayer = from === to;
    const allowed = sameLayer || !mutation;
    return {
      from,
      to,
      mutation,
      allowed,
      reason: allowed ? "boundary_respected" : "cross_boundary_mutation_denied"
    };
  }
}
