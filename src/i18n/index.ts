import { en } from "./en.js";
import { th } from "./th.js";

export type TelegramLanguage = "en" | "th";
export type AlertMessages = typeof en;

export function normalizeTelegramLanguage(language: string | undefined): TelegramLanguage {
  return language === "th" || language === "en" ? language : "en";
}

export function getMessages(language: string | undefined): AlertMessages {
  return normalizeTelegramLanguage(language) === "th" ? th : en;
}
