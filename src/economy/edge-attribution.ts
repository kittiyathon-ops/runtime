import { TamperEvidentEvidenceLog } from "../audit/tamper-evident-evidence-log.js";

export interface EdgeAttributionReport {
  reportId: string;
  periodStart: number;
  periodEnd: number;
  currency: string;
  strategyGrossEdgeBps: number;
  executionQualityEdgeBps: number;
  survivabilityOverheadBps: number;
  reconciliationCostBps: number;
  governancePenaltyBps: number;
  operationalOverheadBps: number;
  infrastructureComplexityCostBps: number;
  netRealizedEdgeBps: number;
  edgeDecayRateBpsPerDay: number;
  survivabilityRatio: number;
  economicViabilityScore: number;
}

export interface SubsystemRoi {
  subsystemId: string;
  runtimeEdgeBps: number;
  marketEdgeBps: number;
  costBps: number;
  roiRatio: number;
}

export interface EdgeAttributionInput extends Omit<
  EdgeAttributionReport,
  "netRealizedEdgeBps" | "survivabilityRatio" | "economicViabilityScore"
> {
  subsystemRoi: readonly SubsystemRoi[];
  cpuOverheadRatio: number;
  memoryOverheadRatio: number;
  evidenceIds: readonly string[];
}

export interface EdgeAccountingDecision {
  status: "ECONOMICALLY_VIABLE" | "ECONOMICALLY_UNVIABLE_REQUIRED";
  report: EdgeAttributionReport;
  violations: string[];
  consecutiveNonPositiveDays: number;
  evidenceHash: string;
}

const MIN_NET_EDGE_BPS_PER_DAY = 0.05;
const MAX_SURVIVABILITY_GROSS_EDGE_RATIO = 0.6;
const MIN_SUBSYSTEM_ROI_RATIO = 2;
const MAX_SURVIVABILITY_CPU_MEMORY_RATIO = 0.15;
const DAY_MS = 24 * 60 * 60 * 1_000;

export class EdgeAccountingLedger {
  private readonly reports: EdgeAttributionReport[] = [];
  private readonly evidenceLog = new TamperEvidentEvidenceLog<Record<string, unknown>>();

  record(input: EdgeAttributionInput): EdgeAccountingDecision {
    validateInput(input);
    const grossEdge = input.strategyGrossEdgeBps + input.executionQualityEdgeBps;
    const totalCost =
      input.survivabilityOverheadBps +
      input.reconciliationCostBps +
      input.governancePenaltyBps +
      input.operationalOverheadBps +
      input.infrastructureComplexityCostBps;
    const netRealizedEdgeBps = grossEdge - totalCost;
    const survivabilityRatio = grossEdge <= 0 ? Number.POSITIVE_INFINITY : input.survivabilityOverheadBps / grossEdge;
    const economicViabilityScore = netRealizedEdgeBps / MIN_NET_EDGE_BPS_PER_DAY;
    const report: EdgeAttributionReport = Object.freeze({
      reportId: input.reportId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currency: input.currency,
      strategyGrossEdgeBps: input.strategyGrossEdgeBps,
      executionQualityEdgeBps: input.executionQualityEdgeBps,
      survivabilityOverheadBps: input.survivabilityOverheadBps,
      reconciliationCostBps: input.reconciliationCostBps,
      governancePenaltyBps: input.governancePenaltyBps,
      operationalOverheadBps: input.operationalOverheadBps,
      infrastructureComplexityCostBps: input.infrastructureComplexityCostBps,
      netRealizedEdgeBps,
      edgeDecayRateBpsPerDay: input.edgeDecayRateBpsPerDay,
      survivabilityRatio,
      economicViabilityScore
    });
    this.reports.push(report);
    const evidence = this.evidenceLog.append("EDGE_ATTRIBUTION_REPORT", input.periodEnd, {
      report,
      subsystemRoi: [...input.subsystemRoi],
      cpuOverheadRatio: input.cpuOverheadRatio,
      memoryOverheadRatio: input.memoryOverheadRatio,
      evidenceIds: [...input.evidenceIds]
    });

    const violations = this.violations(input, report);
    const consecutiveNonPositiveDays = this.consecutiveNonPositiveDays();
    if (consecutiveNonPositiveDays >= 7) violations.push("net_realized_edge_non_positive_7_consecutive_days");

    return {
      status: violations.length === 0 ? "ECONOMICALLY_VIABLE" : "ECONOMICALLY_UNVIABLE_REQUIRED",
      report,
      violations,
      consecutiveNonPositiveDays,
      evidenceHash: evidence.hash
    };
  }

  latest(): EdgeAttributionReport | undefined {
    return this.reports.at(-1);
  }

  all(): readonly EdgeAttributionReport[] {
    return this.reports;
  }

  verifyEvidence(): boolean {
    return this.evidenceLog.verify();
  }

  private violations(input: EdgeAttributionInput, report: EdgeAttributionReport): string[] {
    const violations: string[] = [];
    if (report.netRealizedEdgeBps < MIN_NET_EDGE_BPS_PER_DAY) violations.push("minimum_viable_net_edge_breach");
    if (report.survivabilityRatio > MAX_SURVIVABILITY_GROSS_EDGE_RATIO) violations.push("survivability_cost_exceeds_60_percent_gross_edge");
    if (input.cpuOverheadRatio > MAX_SURVIVABILITY_CPU_MEMORY_RATIO) violations.push("survivability_cpu_overhead_exceeds_15_percent");
    if (input.memoryOverheadRatio > MAX_SURVIVABILITY_CPU_MEMORY_RATIO) violations.push("survivability_memory_overhead_exceeds_15_percent");
    for (const subsystem of input.subsystemRoi) {
      if (subsystem.roiRatio <= MIN_SUBSYSTEM_ROI_RATIO) violations.push(`subsystem_roi_breach:${subsystem.subsystemId}`);
    }
    return violations;
  }

  private consecutiveNonPositiveDays(): number {
    let count = 0;
    for (const report of [...this.reports].reverse()) {
      if (report.netRealizedEdgeBps > 0) break;
      count += 1;
    }
    return count;
  }
}

export function assertDailyEdgeReportCadence(reports: readonly EdgeAttributionReport[]): void {
  for (let index = 1; index < reports.length; index += 1) {
    const previous = reports[index - 1]!;
    const current = reports[index]!;
    if (current.periodStart - previous.periodStart !== DAY_MS) {
      throw new Error(`edge_report_daily_cadence_breach:${previous.reportId}->${current.reportId}`);
    }
  }
}

function validateInput(input: EdgeAttributionInput): void {
  if (input.reportId.length === 0) throw new Error("edge_report_id_required");
  if (input.currency.length === 0) throw new Error("edge_currency_required");
  if (!Number.isInteger(input.periodStart) || !Number.isInteger(input.periodEnd) || input.periodEnd <= input.periodStart) {
    throw new Error("edge_report_period_invalid");
  }
  if (input.periodEnd - input.periodStart !== DAY_MS) throw new Error("edge_report_must_be_daily");
  if (input.evidenceIds.length === 0) throw new Error("edge_report_requires_evidence");
  if (input.subsystemRoi.length === 0) throw new Error("edge_report_requires_subsystem_roi");
  for (const value of [
    input.strategyGrossEdgeBps,
    input.executionQualityEdgeBps,
    input.survivabilityOverheadBps,
    input.reconciliationCostBps,
    input.governancePenaltyBps,
    input.operationalOverheadBps,
    input.infrastructureComplexityCostBps,
    input.edgeDecayRateBpsPerDay,
    input.cpuOverheadRatio,
    input.memoryOverheadRatio
  ]) {
    if (!Number.isFinite(value)) throw new Error("edge_report_numeric_invalid");
  }
}
