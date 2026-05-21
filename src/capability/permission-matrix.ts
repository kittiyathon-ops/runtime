export type CapabilityLayer = "edge" | "governance" | "recovery" | "runtime" | "observability" | "simulation";
export type CapabilityPermission = "recommend" | "authorize" | "restore" | "execute" | "observe" | "sandbox" | "mutate";

export const PERMISSION_MATRIX: Record<CapabilityLayer, readonly CapabilityPermission[]> = {
  edge: ["recommend"],
  governance: ["authorize"],
  recovery: ["restore"],
  runtime: ["execute"],
  observability: ["observe"],
  simulation: ["sandbox"]
};

export function hasPermission(layer: CapabilityLayer, permission: CapabilityPermission): boolean {
  return PERMISSION_MATRIX[layer].includes(permission);
}
