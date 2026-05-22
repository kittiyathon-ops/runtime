import { createHash } from "node:crypto";
import type { RuntimeConfig } from "../infra/config.js";

export interface ConfigEvidenceBundle {
  readonly fingerprint: string;
  readonly capturedAt: number;
  readonly evidenceId: string;
}

export function configFingerprint(config: RuntimeConfig): string {
  return createHash("sha256").update(stableJson(redactedConfig(config))).digest("hex");
}

export function captureConfigEvidence(config: RuntimeConfig, capturedAt: number): ConfigEvidenceBundle {
  const fingerprint = configFingerprint(config);
  return {
    fingerprint,
    capturedAt,
    evidenceId: `config:${fingerprint.slice(0, 16)}:${capturedAt}`
  };
}

function redactedConfig(config: RuntimeConfig): Record<string, unknown> {
  return {
    ...config,
    binanceApiKey: config.binanceApiKey.length === 0 ? "" : "<redacted>",
    binanceApiSecret: config.binanceApiSecret.length === 0 ? "" : "<redacted>",
    telegramBotToken: config.telegramBotToken.length === 0 ? "" : "<redacted>",
    telegramChatId: config.telegramChatId.length === 0 ? "" : "<redacted>"
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
