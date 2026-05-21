import { hasPermission, type CapabilityLayer, type CapabilityPermission } from "./permission-matrix.js";

export interface CapabilityGrant {
  capabilityId: string;
  layer: CapabilityLayer;
  permission: CapabilityPermission;
  explicit: true;
  traceId: string;
}

export class CapabilityRegistry {
  private readonly grants = new Map<string, CapabilityGrant>();

  grant(input: Omit<CapabilityGrant, "explicit">): CapabilityGrant {
    if (input.traceId.length === 0) throw new Error("trace_id_required");
    if (!hasPermission(input.layer, input.permission)) throw new Error(`capability_permission_denied:${input.layer}:${input.permission}`);
    if (this.grants.has(input.capabilityId)) throw new Error(`capability_duplicate:${input.capabilityId}`);
    const grant = Object.freeze({ ...input, explicit: true as const });
    this.grants.set(input.capabilityId, grant);
    return grant;
  }

  require(capabilityId: string, permission: CapabilityPermission): CapabilityGrant {
    const grant = this.grants.get(capabilityId);
    if (grant === undefined) throw new Error(`capability_missing:${capabilityId}`);
    if (grant.permission !== permission) throw new Error(`capability_scope_mismatch:${capabilityId}:${permission}`);
    return grant;
  }
}
