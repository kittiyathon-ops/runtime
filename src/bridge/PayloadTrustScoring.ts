import type { EventInput } from "../core/event.js";

export type PayloadAcceptanceDecision = "ACCEPT" | "QUARANTINE" | "REJECT";

export interface PayloadTrustAssessment {
  trustScore: number;
  flags: string[];
  acceptanceDecision: PayloadAcceptanceDecision;
}

export class PayloadTrustScorer {
  assess(input: EventInput): PayloadTrustAssessment {
    const flags: string[] = [];
    let trustScore = 1;

    if (input.exchangeTimestamp === undefined) {
      flags.push("missing_exchange_time");
      trustScore -= 0.25;
    }
    if (input.receiveTimestamp === undefined) {
      flags.push("missing_received_time");
      trustScore -= 0.35;
    }
    if (input.eventId === undefined) {
      flags.push("missing_event_id");
      trustScore -= 0.15;
    }
    const sequenceId = input.payload.sequence_id ?? input.payload.sequenceId ?? input.payload.updateId ?? input.payload.tradeId;
    if (sequenceId === undefined && (input.source === "binance_market_ws" || input.source === "binance_user_ws")) {
      flags.push("missing_sequence_id");
      trustScore -= 0.2;
    }
    if (Object.values(input.payload).some((value) => typeof value === "number" && !Number.isFinite(value))) {
      flags.push("non_finite_numeric_payload");
      trustScore = 0;
    }

    const boundedTrustScore = Math.max(0, Math.min(1, Number(trustScore.toFixed(4))));
    return {
      trustScore: boundedTrustScore,
      flags,
      acceptanceDecision: boundedTrustScore < 0.5 ? "REJECT" : boundedTrustScore < 0.8 ? "QUARANTINE" : "ACCEPT"
    };
  }
}
