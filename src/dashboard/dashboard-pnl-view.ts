import type { PortfolioSnapshot } from "../runtime/portfolio-state-engine.js";
import type { DashboardPnlSummaryCard, DashboardPortfolioSummary } from "./dashboard-models.js";

export function buildPnlSummary(snapshot: PortfolioSnapshot): DashboardPnlSummaryCard {
  return {
    realizedPnlUsd: snapshot.realizedPnlUsd,
    unrealizedPnlUsd: snapshot.unrealizedPnlUsd,
    feesUsd: snapshot.feesUsd,
    fundingUsd: snapshot.fundingUsd,
    exposureUsd: snapshot.exposureUsd
  };
}

export function buildPortfolioSummary(snapshot: PortfolioSnapshot): DashboardPortfolioSummary {
  return {
    lastSeq: snapshot.lastSeq,
    positions: snapshot.positions,
    balances: snapshot.balances,
    pnl: buildPnlSummary(snapshot)
  };
}

