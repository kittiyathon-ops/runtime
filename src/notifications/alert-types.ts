import type { TelegramAlertPayload } from "./telegram-message-types.js";

export type StructuredAlertPayload = TelegramAlertPayload;

export function assertSerializableAlert(payload: StructuredAlertPayload): void {
  try {
    JSON.stringify(payload);
  } catch (error) {
    throw new Error(`alert_payload_not_serializable:${error instanceof Error ? error.message : "unknown"}`);
  }
}

