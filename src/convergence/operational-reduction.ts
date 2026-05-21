import type { SurvivabilityPrimitive } from "./survivability-primitives.js";

export interface OperationalLayer {
  layerId: string;
  mappedPrimitiveIds: readonly SurvivabilityPrimitive[];
  operationalValue: number;
  complexityCost: number;
  replayPreservedIfRemoved: boolean;
  identityPreservedIfRemoved: boolean;
  mortalityPreservedIfRemoved: boolean;
  recoveryPreservedIfRemoved: boolean;
  evidenceIds: string[];
}

export function operationalReduction(layers: readonly OperationalLayer[], requiredPrimitives: readonly SurvivabilityPrimitive[], evidenceIds: string[]) {
  if (layers.length === 0 || requiredPrimitives.length === 0 || evidenceIds.length === 0) throw new Error("operational_reduction_requires_evidence");
  const required = new Set(requiredPrimitives);
  const decisions = layers
    .map((layer) => {
      if (layer.evidenceIds.length === 0) throw new Error("operational_layer_requires_evidence");
      const protectsRequired = layer.mappedPrimitiveIds.some((primitive) => required.has(primitive));
      const lowLeverage = layer.operationalValue < layer.complexityCost;
      const safeRemoval = layer.replayPreservedIfRemoved &&
        layer.identityPreservedIfRemoved &&
        layer.mortalityPreservedIfRemoved &&
        layer.recoveryPreservedIfRemoved;
      return {
        layerId: layer.layerId,
        action: !protectsRequired && lowLeverage && safeRemoval ? "CANDIDATE_FOR_REMOVAL" as const : "RETAIN" as const,
        protectsRequired,
        leverageRatio: layer.complexityCost === 0 ? layer.operationalValue : layer.operationalValue / layer.complexityCost,
        mappedPrimitiveIds: [...layer.mappedPrimitiveIds].sort(),
        evidenceIds: [...layer.evidenceIds]
      };
    })
    .sort((a, b) => a.layerId.localeCompare(b.layerId));
  return { status: "REDUCTION_EVALUATED" as const, decisions, evidenceIds: [...evidenceIds] };
}
