import { getMessages, normalizeTelegramLanguage } from "../i18n/index.js";
import { normalizeAlertMode, type AlertMode } from "./alert-mode.js";
import { EMOJI, severityEmoji, tagEmoji } from "./emoji-map.js";
import type {
  ClosedPositionSummary,
  AggregatedAlert,
  DailySummaryAlert,
  GovernanceTransitionAlert,
  PnlSnapshotSummary,
  ReplayAlert,
  RuntimeAlertSummary,
  StructuredTelegramAlert
} from "./telegram-message-types.js";

const SEPARATOR = "━━━━━━━━━━━━━━";

export function formatUsd(value: number, decimals = 4): string {
  return `${value.toFixed(decimals)} USDT`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(3)}%`;
}

export function formatPositionClosed(data: ClosedPositionSummary, language = data.language ?? "th"): string {
  const mode = alertMode(data);
  const labels = labelsFor(language);
  const win = data.pnl >= 0;
  const result = win ? labels.win : labels.loss;
  if (mode === "compact") {
    return withHeader(data, [
      `${win ? EMOJI.profit : EMOJI.loss} ${data.side} ${data.symbol}`,
      `${formatUsd(data.pnl)} (${formatPercent(data.pnlPercent)})`,
      ...compactCorrelationLines(data)
    ]).join("\n");
  }

  const optionalLines = [
    data.rrRatio === undefined ? undefined : `⚖️ RR:\n${formatRiskReward(data.rrRatio)}`,
    data.holdTime === undefined ? undefined : `⏱️ Hold Time:\n${data.holdTime}`,
    data.strategyReason === undefined ? undefined : `Strategy:\n${data.strategyReason}`,
    data.runtimeState === undefined ? undefined : `Runtime:\n${data.runtimeState}`
  ].filter((line): line is string => line !== undefined);
  const dailySummary = formatDailySummary(
    {
      severity: data.severity,
      primaryTag: data.primaryTag,
      secondaryTags: data.secondaryTags,
      mode,
      language,
      correlation: data.correlation,
      wins: data.wins,
      losses: data.losses,
      totalWinUsd: data.totalWinUsd,
      totalLossUsd: data.totalLossUsd,
      sessionTotal: data.sessionTotal
    },
    language
  );

  return [
    ...withHeader(data, []),
    "",
    win ? labels.positionClosedWin : labels.positionClosedLoss,
    "",
    `${labels.symbol}:\n${data.symbol}`,
    "",
    `${labels.side}:\n${data.side}`,
    "",
    `${labels.qty}:\n${data.qty}`,
    "",
    SEPARATOR,
    "",
    `${labels.entry}:\n${data.entry.toFixed(2)}`,
    "",
    `${labels.exit}:\n${data.exit.toFixed(2)}`,
    "",
    `${labels.result}:\n${result}`,
    "",
    `PnL:\n${formatUsd(data.pnl)}`,
    "",
    `PnL %:\n${formatPercent(data.pnlPercent)}`,
    ...(optionalLines.length === 0 ? [] : ["", SEPARATOR, "", ...joinBlocks(optionalLines)]),
    SEPARATOR,
    "",
    dailySummary,
    "",
    SEPARATOR,
    "",
    `Order ID:\n${data.orderId}`,
    ...verboseCorrelationLines(data)
  ].join("\n");
}

export function formatRuntimeStarted(summary: RuntimeAlertSummary, language = "th"): string {
  return formatRuntimeAlert(getMessages(language).runtimeStarted, summary, [
    summary.profile === undefined ? undefined : `profile=${summary.profile}`
  ]);
}

export function formatRuntimeStopped(summary: RuntimeAlertSummary, language = "th"): string {
  return formatRuntimeAlert(getMessages(language).runtimeStopped, summary);
}

export function formatSafeMode(summary: RuntimeAlertSummary, language = "th"): string {
  return formatRuntimeAlert(getMessages(language).safeMode, summary);
}

export function formatOrderSubmitted(summary: RuntimeAlertSummary, language = "th"): string {
  return formatRuntimeAlert(getMessages(language).orderSubmitted, summary, ["DRY_RUN ORDER_SUBMITTED"]);
}

export function formatOrderFilled(summary: RuntimeAlertSummary, language = "th"): string {
  return formatRuntimeAlert(getMessages(language).orderFilled, summary, [
    summary.value === undefined ? undefined : `simulated notional=${summary.value}`
  ]);
}

export function formatRuntimeError(summary: RuntimeAlertSummary, language = "th"): string {
  return formatRuntimeAlert(getMessages(language).runtimeError, summary);
}

export function formatRiskLimitHit(summary: RuntimeAlertSummary, language = "th"): string {
  return formatRuntimeAlert(getMessages(language).riskLimitHit, summary);
}

export function formatWebsocketDisconnected(summary: RuntimeAlertSummary, language = "th"): string {
  return formatRuntimeAlert(getMessages(language).websocketDisconnected, summary);
}

export function formatWebsocketReconnecting(summary: RuntimeAlertSummary, language = "th"): string {
  return formatRuntimeAlert(getMessages(language).websocketReconnecting, summary);
}

export function formatPnlSnapshot(summary: PnlSnapshotSummary, language = "th"): string {
  const messages = getMessages(language);
  if (alertMode(summary) === "compact") {
    return withHeader(summary, [
      `${messages.pnlUpdate(summary.totalPnlUsd)}`,
      ...compactCorrelationLines(summary)
    ]).join("\n");
  }

  return [
    ...withHeader(summary, []),
    "",
    messages.pnlUpdate(summary.totalPnlUsd),
    SEPARATOR,
    `Realized:\n${formatUsd(summary.realizedPnlUsd)}`,
    "",
    `Unrealized:\n${formatUsd(summary.unrealizedPnlUsd)}`,
    ...(summary.maxDrawdownUsd === undefined ? [] : ["", `Max Drawdown:\n${formatUsd(summary.maxDrawdownUsd)}`]),
    ...(summary.winRate === undefined ? [] : ["", `Winrate:\n${(summary.winRate * 100).toFixed(1)}%`]),
    ...(summary.runtimeState === undefined ? [] : ["", `Runtime:\n${summary.runtimeState}`])
    , ...verboseCorrelationLines(summary)
  ].join("\n");
}

export function formatDailySummary(summary: DailySummaryAlert, language = summary.language ?? "th"): string {
  const labels = labelsFor(language);
  if (alertMode(summary) === "compact") {
    return withHeader(summary, [
      `${getMessages(language).dailyPnl(summary.sessionTotal)} winrate=${winRate(summary.wins, summary.losses)}`,
      ...compactCorrelationLines(summary)
    ]).join("\n");
  }

  return [
    ...withHeader(summary, []),
    "",
    labels.dailySummary,
    "",
    `✅ ${labels.wins}:\n${summary.wins} ${labels.trades} (+${formatUsd(summary.totalWinUsd)})`,
    "",
    `❌ ${labels.losses}:\n${summary.losses} ${labels.trades} (-${formatUsd(Math.abs(summary.totalLossUsd))})`,
    "",
    `Winrate:\n${winRate(summary.wins, summary.losses)}`,
    "",
    getMessages(language).dailyPnl(summary.sessionTotal),
    ...verboseCorrelationLines(summary)
  ].join("\n");
}

export function formatGovernanceTransition(summary: GovernanceTransitionAlert, language = summary.language ?? "th"): string {
  return formatRuntimeAlert(
    `${EMOJI.governance} Governance state transition`,
    {
      ...summary,
      state: summary.to,
      ...(summary.reason === undefined ? {} : { reason: summary.reason }),
      ...(summary.correlationId === undefined ? {} : { correlationId: summary.correlationId })
    },
    [`from=${summary.from}`, `to=${summary.to}`]
  );
}

export function formatReplayAlert(summary: ReplayAlert & { kind?: string }, language = summary.language ?? "th"): string {
  const expectedSeq = summary.expectedSeq;
  const receivedSeq = summary.receivedSeq ?? summary.seq;
  const gap = summary.gap ?? (expectedSeq !== undefined && receivedSeq !== undefined ? Math.abs(receivedSeq - expectedSeq) : undefined);
  const title = replayTitle(summary.kind);
  if (alertMode(summary) === "compact") {
    return withHeader(summary, [
      `${EMOJI.replay} ${title}`,
      expectedSeq === undefined || receivedSeq === undefined ? `reason=${summary.reason}` : `expected=${expectedSeq} received=${receivedSeq}`,
      ...(gap === undefined ? [] : [`gap=${gap}`]),
      ...compactCorrelationLines(summary)
    ]).join("\n");
  }

  return [
    ...withHeader(summary, []),
    "",
    `${EMOJI.warning} ${title}`,
    "",
    ...(expectedSeq === undefined ? [] : [`Expected sequence:\n${expectedSeq}`, ""]),
    ...(receivedSeq === undefined ? [] : [`Received sequence:\n${receivedSeq}`, ""]),
    ...(gap === undefined ? [] : [`Gap:\n${gap} events`, ""]),
    `Reason:\n${summary.reason}`,
    ...(summary.eventId === undefined ? [] : ["", `Event ID:\n${summary.eventId}`]),
    ...(summary.replayCursor === undefined ? [] : ["", `Replay Cursor:\n${summary.replayCursor}`]),
    ...verboseCorrelationLines(summary)
  ].join("\n");
}

export function formatAlertAggregation(summary: AggregatedAlert): string {
  if (alertMode(summary) === "compact") {
    return withHeader(summary, [
      `${EMOJI.warning} ${summary.count} repeated alerts in ${Math.round(summary.windowMs / 1000)}s`,
      `key=${summary.summaryKey}`
    ]).join("\n");
  }

  return [
    ...withHeader(summary, []),
    "",
    `${EMOJI.warning} Repeated alert summary`,
    "",
    `Count:\n${summary.count}`,
    "",
    `Window:\n${summary.windowMs}ms`,
    "",
    `Summary Key:\n${summary.summaryKey}`,
    "",
    `Fingerprint:\n${summary.fingerprint}`,
    ...verboseCorrelationLines(summary)
  ].join("\n");
}

function formatRuntimeAlert(title: string, summary: RuntimeAlertSummary, extraLines: Array<string | undefined> = []): string {
  const filteredExtraLines = extraLines.filter((line): line is string => line !== undefined);
  if (alertMode(summary) === "compact") {
    return withHeader(summary, [
      title,
      ...filteredExtraLines,
      ...(summary.symbol === undefined ? [] : [`symbol=${summary.symbol}`]),
      ...(summary.reason === undefined ? [] : [`reason=${summary.reason}`]),
      ...compactCorrelationLines(summary)
    ]).join("\n");
  }

  return [
    ...withHeader(summary, []),
    "",
    title,
    ...filteredExtraLines,
    ...(summary.symbol === undefined ? [] : [`symbol=${summary.symbol}`]),
    ...(summary.state === undefined ? [] : [`Runtime: ${summary.state}`]),
    ...(summary.reason === undefined ? [] : [`reason=${summary.reason}`]),
    ...(summary.correlationId === undefined ? [] : [`correlation=${summary.correlationId}`]),
    ...(summary.seq === undefined ? [] : [`seq=${summary.seq}`]),
    ...verboseCorrelationLines(summary)
  ].join("\n");
}

function withHeader(alert: StructuredTelegramAlert, lines: string[]): string[] {
  return [
    `${severityEmoji(alert.severity)} ${alert.severity} ${tagEmoji(alert.primaryTag)} ${alert.primaryTag}${formatSecondaryTags(alert)}`,
    ...lines
  ];
}

function formatSecondaryTags(alert: StructuredTelegramAlert): string {
  if (alert.secondaryTags === undefined || alert.secondaryTags.length === 0) return "";
  return ` ${alert.secondaryTags.join(" ")}`;
}

function alertMode(alert: StructuredTelegramAlert): AlertMode {
  return normalizeAlertMode(alert.mode);
}

function compactCorrelationLines(alert: StructuredTelegramAlert): string[] {
  if (alert.severity !== "CRITICAL" && alert.severity !== "FATAL") return [];
  return idLines(alert).slice(0, 2);
}

function verboseCorrelationLines(alert: StructuredTelegramAlert): string[] {
  const lines = idLines(alert);
  return lines.length === 0 ? [] : ["", ...lines];
}

function idLines(alert: StructuredTelegramAlert): string[] {
  const correlation = alert.correlation;
  if (correlation === undefined) return [];
  return [
    correlation.traceId === undefined ? undefined : `trace_id=${correlation.traceId}`,
    correlation.eventId === undefined ? undefined : `event_id=${correlation.eventId}`,
    correlation.orderId === undefined ? undefined : `order_id=${correlation.orderId}`,
    correlation.sessionId === undefined ? undefined : `session_id=${correlation.sessionId}`
  ].filter((line): line is string => line !== undefined);
}

function replayTitle(kind: string | undefined): string {
  if (kind === "missing_sequence") return "MISSING SEQUENCE DETECTED";
  if (kind === "duplicate_sequence") return "DUPLICATE SEQUENCE DETECTED";
  if (kind === "out_of_order_sequence") return "OUT-OF-ORDER SEQUENCE DETECTED";
  return "REPLAY DIVERGENCE DETECTED";
}

function labelsFor(language: string | undefined): {
  positionClosedWin: string;
  positionClosedLoss: string;
  symbol: string;
  side: string;
  qty: string;
  entry: string;
  exit: string;
  result: string;
  win: string;
  loss: string;
  dailySummary: string;
  wins: string;
  losses: string;
  trades: string;
} {
  if (normalizeTelegramLanguage(language) === "th") {
    return {
      positionClosedWin: "✅ ปิดสถานะเรียบร้อย",
      positionClosedLoss: "❌ ปิดสถานะเรียบร้อย",
      symbol: "เหรียญ",
      side: "ฝั่ง",
      qty: "จำนวน",
      entry: "ราคาเข้า",
      exit: "ราคาปิด",
      result: "ผลลัพธ์",
      win: "✅ กำไร",
      loss: "❌ ขาดทุน",
      dailySummary: "สรุปวันนี้",
      wins: "ชนะ",
      losses: "แพ้",
      trades: "ไม้"
    };
  }

  return {
    positionClosedWin: "✅ Position closed",
    positionClosedLoss: "❌ Position closed",
    symbol: "Symbol",
    side: "Side",
    qty: "Quantity",
    entry: "Entry",
    exit: "Exit",
    result: "Result",
    win: "✅ WIN",
    loss: "❌ LOSS",
    dailySummary: "Daily summary",
    wins: "Wins",
    losses: "Losses",
    trades: "trades"
  };
}

function joinBlocks(blocks: string[]): string[] {
  return blocks.flatMap((block, index) => (index === blocks.length - 1 ? [block] : [block, ""]));
}

function formatRiskReward(value: number): string {
  return `1 : ${value.toFixed(2)}`;
}

function winRate(wins: number, losses: number): string {
  return `${((wins / Math.max(1, wins + losses)) * 100).toFixed(1)}%`;
}
