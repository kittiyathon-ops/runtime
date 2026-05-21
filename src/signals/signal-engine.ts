import type { EventInput, RuntimeEvent } from "../core/event.js";
import { rootCorrelationId } from "../core/ids.js";

export interface SignalContext {
  nowMs: number;
}

export interface SignalCandidate {
  signalType: string;
  symbol?: string;
  confidence?: number;
  payload: Record<string, unknown>;
  correlationId?: string;
}

export interface SignalProvider {
  readonly id: string;
  evaluate(event: RuntimeEvent, context: SignalContext): SignalCandidate[] | Promise<SignalCandidate[]>;
}

export interface SignalToIntentDecision {
  allow: boolean;
  intent?: {
    symbol?: string;
    payload: Record<string, unknown>;
    correlationId?: string;
  };
  reason?: string;
}

export interface SignalToIntentPolicy {
  readonly id: string;
  evaluate(signal: RuntimeEvent, context: SignalContext): SignalToIntentDecision | Promise<SignalToIntentDecision>;
}

export interface DeterministicSignalStrategy extends SignalToIntentPolicy {
  evaluateMarketEvent(event: RuntimeEvent, context: SignalContext): SignalCandidate[] | Promise<SignalCandidate[]>;
}

export class RejectAllSignalToIntentPolicy implements SignalToIntentPolicy {
  readonly id = "reject_all_signal_to_intent";

  evaluate(): SignalToIntentDecision {
    return { allow: false, reason: "signal_to_intent_disabled" };
  }
}

export class CompositeSignalToIntentPolicy implements SignalToIntentPolicy {
  readonly id = "composite_signal_to_intent";

  private readonly strategies: DeterministicSignalStrategy[] = [];

  register(strategy: DeterministicSignalStrategy): void {
    if (this.strategies.some((registered) => registered.id === strategy.id)) {
      throw new Error(`signal_strategy_duplicate:${strategy.id}`);
    }
    this.strategies.push(strategy);
  }

  listStrategies(): readonly DeterministicSignalStrategy[] {
    return this.strategies;
  }

  async evaluate(signal: RuntimeEvent, context: SignalContext): Promise<SignalToIntentDecision> {
    const strategyId = signal.payload.strategyId;
    if (typeof strategyId === "string") {
      const strategy = this.strategies.find((candidate) => candidate.id === strategyId);
      if (strategy === undefined) return { allow: false, reason: `signal_strategy_not_registered:${strategyId}` };
      return strategy.evaluate(signal, context);
    }

    for (const strategy of this.strategies) {
      const decision = await strategy.evaluate(signal, context);
      if (decision.allow) return decision;
    }
    return { allow: false, reason: "signal_strategy_not_matched" };
  }
}

export function signalIntentDecisionToEventInput(
  policy: SignalToIntentPolicy,
  signal: RuntimeEvent,
  decision: SignalToIntentDecision,
  context: SignalContext
): EventInput {
  if (!decision.allow || decision.intent === undefined) {
    throw new Error("signal_intent_decision_not_allowed");
  }
  return {
    eventId: `intent:${policy.id}:${signal.seq}`,
    timestamp: context.nowMs,
    receiveTimestamp: context.nowMs,
    processingTimestamp: context.nowMs,
    source: "runtime",
    symbol: decision.intent.symbol ?? signal.symbol,
    eventType: "INTENT_CREATED",
    correlationId: decision.intent.correlationId ?? signal.correlationId,
    causationId: String(signal.seq),
    payload: {
      policyId: policy.id,
      signalType: signal.payload.signalType,
      ...decision.intent.payload
    }
  };
}

export class SignalEngine {
  private readonly providers: SignalProvider[] = [];

  register(provider: SignalProvider): void {
    if (this.providers.some((registered) => registered.id === provider.id)) {
      throw new Error(`signal_provider_duplicate:${provider.id}`);
    }
    this.providers.push(provider);
  }

  registerStrategy(strategy: DeterministicSignalStrategy): void {
    this.register(new StrategySignalProvider(strategy));
  }

  listProviders(): readonly SignalProvider[] {
    return this.providers;
  }

  async evaluate(event: RuntimeEvent, context: SignalContext): Promise<EventInput[]> {
    const signals: EventInput[] = [];
    for (const provider of this.providers) {
      const candidates = await provider.evaluate(event, context);
      for (const candidate of candidates) {
        signals.push(this.toEventInput(provider, event, candidate, context));
      }
    }
    return signals;
  }

  private toEventInput(
    provider: SignalProvider,
    causationEvent: RuntimeEvent,
    candidate: SignalCandidate,
    context: SignalContext
  ): EventInput {
    const symbol = candidate.symbol ?? causationEvent.symbol;
    return {
      eventId: `signal:${provider.id}:${causationEvent.seq}:${candidate.signalType}`,
      timestamp: context.nowMs,
      receiveTimestamp: context.nowMs,
      processingTimestamp: context.nowMs,
      source: "runtime",
      symbol,
      eventType: "SIGNAL_CREATED",
      correlationId: candidate.correlationId ?? causationEvent.correlationId ?? rootCorrelationId(),
      causationId: String(causationEvent.seq),
      payload: {
        providerId: provider.id,
        signalType: candidate.signalType,
        confidence: candidate.confidence ?? 1,
        ...candidate.payload
      }
    };
  }
}

class StrategySignalProvider implements SignalProvider {
  readonly id: string;

  constructor(private readonly strategy: DeterministicSignalStrategy) {
    this.id = strategy.id;
  }

  evaluate(event: RuntimeEvent, context: SignalContext): SignalCandidate[] | Promise<SignalCandidate[]> {
    if (event.eventType !== "MARKET_TICK") return [];
    return this.strategy.evaluateMarketEvent(event, context);
  }
}

export class SpreadWideningSignalProvider implements SignalProvider {
  readonly id = "spread_widening_detector";

  constructor(private readonly thresholdBps: number) {
    if (!Number.isFinite(thresholdBps) || thresholdBps <= 0) {
      throw new Error("spread_threshold_invalid");
    }
  }

  evaluate(event: RuntimeEvent): SignalCandidate[] {
    if (event.eventType !== "BOOK_UPDATE" && event.eventType !== "MARKET_TICK") {
      return [];
    }

    const bid = Number(event.payload.bidPrice ?? event.payload.bid);
    const ask = Number(event.payload.askPrice ?? event.payload.ask);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || bid <= 0 || ask <= 0 || ask <= bid) {
      return [];
    }

    const midpoint = (bid + ask) / 2;
    const spread = ask - bid;
    const spreadBps = (spread / midpoint) * 10_000;
    if (spreadBps < this.thresholdBps) {
      return [];
    }

    return [
      {
        signalType: "SPREAD_WIDENING",
        confidence: 1,
        payload: {
          bid,
          ask,
          spread,
          spreadBps,
          thresholdBps: this.thresholdBps
        }
      }
    ];
  }
}
