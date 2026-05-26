import type { RuntimeEvent } from "../core/event.js";
import {
  PortfolioStateEngine,
  type PortfolioDivergence,
  type PortfolioDivergenceReport,
  type PortfolioSnapshot
} from "./portfolio-state-engine.js";

export interface PortfolioReconstructionResult {
  snapshot: PortfolioSnapshot;
  divergenceReport: PortfolioDivergenceReport;
  appliedEvents: number;
  status: "OK" | "DIVERGENT" | "FAILED";
}

export class PortfolioReconstructionEngine {
  reconstruct(events: readonly RuntimeEvent[], expected?: {
    positions?: Record<string, number>;
    balances?: Record<string, number>;
    realizedPnlUsd?: number;
    feesUsd?: number;
    fundingUsd?: number;
    requiredFillIds?: string[];
  }): PortfolioReconstructionResult {
    const engine = new PortfolioStateEngine();
    const divergences: PortfolioDivergence[] = [];
    let appliedEvents = 0;
    let previousSeq = 0;
    const seenFillIds = new Set<string>();

    for (const event of events) {
      if (previousSeq > 0 && event.seq <= previousSeq) {
        divergences.push({
          type: "out_of_order_fill",
          seq: event.seq,
          ...(event.eventId === undefined ? {} : { eventId: event.eventId }),
          reason: "event_sequence_not_strictly_increasing"
        });
        return { snapshot: engine.snapshot(), divergenceReport: { divergent: true, divergences }, appliedEvents, status: "FAILED" };
      }

      if (event.eventType === "ORDER_FILLED") {
        const fillId = fillIdFor(event);
        if (seenFillIds.has(fillId)) {
          divergences.push({ type: "duplicate_fill", seq: event.seq, eventId: fillId, reason: "duplicate_fill_id" });
          return { snapshot: engine.snapshot(), divergenceReport: { divergent: true, divergences }, appliedEvents, status: "FAILED" };
        }
        seenFillIds.add(fillId);
      }

      try {
        engine.apply(event);
        appliedEvents += 1;
        previousSeq = event.seq;
      } catch (error) {
        divergences.push({
          type: "out_of_order_fill",
          seq: event.seq,
          ...(event.eventId === undefined ? {} : { eventId: event.eventId }),
          reason: error instanceof Error ? error.message : "portfolio_reconstruction_failed"
        });
        return { snapshot: engine.snapshot(), divergenceReport: { divergent: true, divergences }, appliedEvents, status: "FAILED" };
      }
    }

    for (const requiredFillId of expected?.requiredFillIds ?? []) {
      if (!seenFillIds.has(requiredFillId)) {
        divergences.push({ type: "missing_fill", eventId: requiredFillId, reason: "required_fill_missing" });
      }
    }

    const expectedReport = engine.compareExpected(expected ?? {});
    divergences.push(...expectedReport.divergences);
    const divergenceReport = { divergent: divergences.length > 0, divergences };
    return {
      snapshot: engine.snapshot(),
      divergenceReport,
      appliedEvents,
      status: divergenceReport.divergent ? "DIVERGENT" : "OK"
    };
  }
}

function fillIdFor(event: RuntimeEvent): string {
  const payloadFillId = event.payload.fillId ?? event.payload.tradeId ?? event.payload.orderId;
  return event.eventId ?? `${event.symbol}:${String(payloadFillId ?? event.seq)}`;
}
