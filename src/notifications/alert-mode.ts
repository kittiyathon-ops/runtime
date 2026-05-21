export type AlertMode = "compact" | "verbose";

export function normalizeAlertMode(mode: string | undefined): AlertMode {
  return mode === "compact" || mode === "verbose" ? mode : "verbose";
}

