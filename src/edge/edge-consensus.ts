import type { RuntimeEvent } from "../core/event.js";
import type { EdgeRecommendation, EdgeSourceId } from "./edge-types.js";

export interface EdgeSourceObservation {
  sourceId: EdgeSourceId;
  event: RuntimeEvent;
  confidence: number;
}

export interface EdgeDivergence {
  sourceId: EdgeSourceId;
  reason: string;
  expected?: unknown;
  actual?: unknown;
}

export interface EdgeDivergenceReport {
  divergent: boolean;
  divergences: EdgeDivergence[];
}

export interface EdgeConsensusResult {
  mode: "SINGLE_SOURCE" | "MULTI_SOURCE";
  confidence: number;
  divergenceReport: EdgeDivergenceReport;
  recommendation: EdgeRecommendation;
}

export class EdgeConsensus {
  compare(observations: readonly EdgeSourceObservation[]): EdgeConsensusResult {
    if (observations.length === 0) throw new Error("edge_consensus_sources_required");
    if (observations.length === 1) {
      return {
        mode: "SINGLE_SOURCE",
        confidence: observations[0]?.confidence ?? 0,
        divergenceReport: { divergent: false, divergences: [] },
        recommendation: "ACCEPT"
      };
    }

    const reference = observations[0];
    if (reference === undefined) throw new Error("edge_consensus_reference_missing");
    const divergences: EdgeDivergence[] = [];
    for (const observation of observations.slice(1)) {
      if (observation.event.symbol !== reference.event.symbol) {
        divergences.push({ sourceId: observation.sourceId, reason: "symbol_divergence", expected: reference.event.symbol, actual: observation.event.symbol });
      }
      if (observation.event.eventType !== reference.event.eventType) {
        divergences.push({ sourceId: observation.sourceId, reason: "event_type_divergence", expected: reference.event.eventType, actual: observation.event.eventType });
      }
      if (stable(observation.event.payload) !== stable(reference.event.payload)) {
        divergences.push({ sourceId: observation.sourceId, reason: "payload_divergence" });
      }
    }

    const divergent = divergences.length > 0;
    return {
      mode: "MULTI_SOURCE",
      confidence: Math.min(...observations.map((observation) => observation.confidence)),
      divergenceReport: { divergent, divergences },
      recommendation: divergent ? "SAFE_MODE" : "ACCEPT"
    };
  }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stable(record[key])}`).join(",")}}`;
}

