import type { RuntimeConfig } from "../infra/config.js";

type TelegramFetch = (url: string, init: {
  method: "POST";
  headers: Record<string, string>;
  body: string;
}) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export interface AlertNotifier {
  sendAlert(message: string): Promise<void>;
}

export class NoopNotifier implements AlertNotifier {
  async sendAlert(): Promise<void> {
    return Promise.resolve();
  }
}

export class TelegramNotifier implements AlertNotifier {
  private readonly enabled: boolean;
  private readonly botToken: string;
  private readonly chatId: string;
  private readonly fetchImpl: TelegramFetch;

  constructor(
    config: Pick<RuntimeConfig, "telegramAlertsEnabled" | "telegramBotToken" | "telegramChatId">,
    fetchImpl: TelegramFetch = globalThis.fetch as TelegramFetch
  ) {
    this.enabled = config.telegramAlertsEnabled;
    this.botToken = config.telegramBotToken;
    this.chatId = config.telegramChatId;
    this.fetchImpl = fetchImpl;

    if (this.enabled && (this.botToken.length === 0 || this.chatId.length === 0)) {
      throw new Error("telegram_config_missing");
    }
  }

  async sendAlert(message: string): Promise<void> {
    if (!this.enabled) return;
    const response = await this.fetchImpl(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text: message,
        disable_web_page_preview: true
      })
    });
    if (!response.ok) {
      throw new Error(`telegram_send_failed:${response.status}`);
    }
  }
}
