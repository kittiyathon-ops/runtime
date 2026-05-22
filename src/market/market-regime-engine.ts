import type {
  MarketStressReport
} from "./market-stress-detector.js";

import type {
  RuntimeExecutionConstraints,
  RuntimeMarketRegimeReport
} from "./runtime-market-regime.js";

export function deriveRuntimeMarketRegime(
  report: MarketStressReport
): RuntimeMarketRegimeReport {

  switch (report.state) {

    case "NORMAL":
      return build(
        "NORMAL",
        true,
        {
          allowNewOrders: true,
          allowAggressiveExecution: true,
          passiveOnly: false,
          reduceOnly: false,
          throttleFactor: 1,
          governanceEscalation: "NONE"
        },
        report
      );

    case "THIN_LIQUIDITY":
      return build(
        "PASSIVE",
        true,
        {
          allowNewOrders: true,
          allowAggressiveExecution: false,
          passiveOnly: true,
          reduceOnly: false,
          throttleFactor: 0.5,
          governanceEscalation: "SAFE_MODE"
        },
        report
      );

    case "TOXIC_FLOW":
      return build(
        "THROTTLED",
        true,
        {
          allowNewOrders: true,
          allowAggressiveExecution: false,
          passiveOnly: true,
          reduceOnly: false,
          throttleFactor: 0.2,
          governanceEscalation: "SAFE_MODE"
        },
        report
      );

    case "STALE_MARKET":
      return build(
        "HALTED",
        false,
        {
          allowNewOrders: false,
          allowAggressiveExecution: false,
          passiveOnly: false,
          reduceOnly: true,
          throttleFactor: 0,
          governanceEscalation: "HALT"
        },
        report
      );

    case "CHAOTIC":
      return build(
        "GOVERNANCE_HALT",
        false,
        {
          allowNewOrders: false,
          allowAggressiveExecution: false,
          passiveOnly: false,
          reduceOnly: true,
          throttleFactor: 0,
          governanceEscalation: "HALT"
        },
        report
      );
  }
}

function build(
  regime: RuntimeMarketRegimeReport["regime"],
  survivable: boolean,
  constraints: RuntimeExecutionConstraints,
  report: MarketStressReport
): RuntimeMarketRegimeReport {

  return {
    regime,
    survivable,
    constraints,
    reasons: report.reasons,
    detectedAtMs: report.detectedAtMs
  };
}
