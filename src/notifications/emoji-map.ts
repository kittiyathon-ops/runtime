import type { AlertSeverity } from "./alert-severity.js";
import type { AlertTag } from "./alert-tags.js";

export const EMOJI = {
  profit: "✅",
  loss: "❌",
  warning: "⚠️",
  critical: "🚨",
  governance: "🧭",
  websocket: "🔌",
  success: "✅",
  failure: "❌",
  long: "📈",
  short: "📉",
  journal: "🧾",
  replay: "🔁",
  halt: "🛑",
  runtime: "🖥️",
  order: "📤",
  risk: "🛡️"
} as const;

export function severityEmoji(severity: AlertSeverity): string {
  if (severity === "INFO") return EMOJI.success;
  if (severity === "WARNING") return EMOJI.warning;
  if (severity === "CRITICAL") return EMOJI.critical;
  return EMOJI.halt;
}

export function tagEmoji(tag: AlertTag): string {
  if (tag === "#ORDER") return EMOJI.order;
  if (tag === "#RISK") return EMOJI.risk;
  if (tag === "#REPLAY") return EMOJI.replay;
  if (tag === "#WS") return EMOJI.websocket;
  return EMOJI.runtime;
}

