import type { BinanceAccountBalance, BinanceOpenOrder, BinancePositionRisk } from "../adapters/binance/binance-rest.js";
import type { PortfolioSnapshot } from "../runtime/portfolio-state-engine.js";
import { PrecisionMath } from "../infrastructure/PrecisionMath.js";

export type StartupTruthAction = "ALLOW" | "GOVERNANCE_HALT";

export interface ExpectedLedgerDelta {
  readonly asset: string;
  readonly amount: string;
  readonly category: "funding_fee" | "commission" | "realized_pnl" | "manual_adjustment";
  readonly evidenceId: string;
}

export interface LocalReplayTruth {
  readonly portfolio: PortfolioSnapshot;
  readonly openClientOrderIds: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface ExchangeTruth {
  readonly balances: readonly BinanceAccountBalance[];
  readonly openOrders: readonly BinanceOpenOrder[];
  readonly positions: readonly BinancePositionRisk[];
  readonly evidenceIds: readonly string[];
}

export interface StartupTruthDivergence {
  readonly kind: "balance_mismatch" | "position_mismatch" | "ghost_order" | "orphan_local_order";
  readonly symbol?: string;
  readonly asset?: string;
  readonly clientOrderId?: string;
  readonly expected?: string;
  readonly actual?: string;
  readonly reason: string;
}

export interface StartupTruthDecision {
  readonly action: StartupTruthAction;
  readonly reason: "startup_truth_reconciled" | "startup_truth_diverged";
  readonly divergences: readonly StartupTruthDivergence[];
  readonly evidenceIds: readonly string[];
}

export class StartupTruthReconciler {
  reconcile(input: {
    readonly local: LocalReplayTruth;
    readonly exchange: ExchangeTruth;
    readonly expectedLedgerDeltas?: readonly ExpectedLedgerDelta[];
    readonly quantityTolerance?: string;
    readonly balanceTolerance?: string;
  }): StartupTruthDecision {
    const evidenceIds = unique([
      ...input.local.evidenceIds,
      ...input.exchange.evidenceIds,
      ...(input.expectedLedgerDeltas ?? []).map((delta) => delta.evidenceId)
    ]);
    if (evidenceIds.length === 0) throw new Error("startup_truth_reconciliation_requires_evidence");

    const quantityTolerance = input.quantityTolerance ?? "0";
    const balanceTolerance = input.balanceTolerance ?? "0";
    const divergences: StartupTruthDivergence[] = [];
    this.compareOpenOrders(input.local.openClientOrderIds, input.exchange.openOrders, divergences);
    this.comparePositions(input.local.portfolio, input.exchange.positions, quantityTolerance, divergences);
    this.compareBalances(input.local.portfolio, input.exchange.balances, input.expectedLedgerDeltas ?? [], balanceTolerance, divergences);

    return {
      action: divergences.length === 0 ? "ALLOW" : "GOVERNANCE_HALT",
      reason: divergences.length === 0 ? "startup_truth_reconciled" : "startup_truth_diverged",
      divergences,
      evidenceIds
    };
  }

  private compareOpenOrders(localClientOrderIds: readonly string[], exchangeOpenOrders: readonly BinanceOpenOrder[], divergences: StartupTruthDivergence[]): void {
    const local = new Set(localClientOrderIds);
    const exchange = new Set(exchangeOpenOrders.map((order) => order.clientOrderId).filter((id) => id.length > 0));
    for (const clientOrderId of exchange) {
      if (!local.has(clientOrderId)) divergences.push({ kind: "ghost_order", clientOrderId, reason: "exchange_order_missing_from_replay" });
    }
    for (const clientOrderId of local) {
      if (!exchange.has(clientOrderId)) divergences.push({ kind: "orphan_local_order", clientOrderId, reason: "replay_order_missing_from_exchange" });
    }
  }

  private comparePositions(portfolio: PortfolioSnapshot, exchangePositions: readonly BinancePositionRisk[], tolerance: string, divergences: StartupTruthDivergence[]): void {
    const symbols = unique([...Object.keys(portfolio.positions), ...exchangePositions.map((position) => position.symbol.toUpperCase())]);
    for (const symbol of symbols) {
      const expected = String(portfolio.positions[symbol]?.quantity ?? 0);
      const actual = exchangePositions.find((position) => position.symbol.toUpperCase() === symbol)?.positionAmt ?? "0";
      if (decimalDiffExceeds(expected, actual, tolerance)) {
        divergences.push({ kind: "position_mismatch", symbol, expected, actual, reason: "startup_position_mismatch" });
      }
    }
  }

  private compareBalances(
    portfolio: PortfolioSnapshot,
    exchangeBalances: readonly BinanceAccountBalance[],
    expectedLedgerDeltas: readonly ExpectedLedgerDelta[],
    tolerance: string,
    divergences: StartupTruthDivergence[]
  ): void {
    const assets = unique([...Object.keys(portfolio.balances), ...expectedLedgerDeltas.map((delta) => delta.asset.toUpperCase())]);
    for (const asset of assets) {
      const expectedBase = String(portfolio.balances[asset]?.total ?? 0);
      const expected = expectedLedgerDeltas
        .filter((delta) => delta.asset.toUpperCase() === asset)
        .reduce((sum, delta) => PrecisionMath.add(sum, delta.amount), expectedBase);
      const actual = exchangeBalances.find((balance) => balance.asset.toUpperCase() === asset)?.balance ?? "0";
      if (decimalDiffExceeds(expected, actual, tolerance)) {
        divergences.push({ kind: "balance_mismatch", asset, expected, actual, reason: "startup_balance_mismatch" });
      }
    }
  }
}

function decimalDiffExceeds(left: string, right: string, tolerance: string): boolean {
  return PrecisionMath.compare(PrecisionMath.abs(PrecisionMath.subtract(left, right)), tolerance) > 0;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}
