export interface ExchangePayloadGuardConfig {
  readonly maxBytes: number;
}

export class ExchangePayloadGuard {
  constructor(private readonly config: ExchangePayloadGuardConfig) {
    if (!Number.isInteger(config.maxBytes) || config.maxBytes <= 0) throw new Error("exchange_payload_max_bytes_invalid");
  }

  parseObject(raw: string): Record<string, unknown> {
    const parsed = this.parseJson(raw);
    if (!isPlainObject(parsed)) throw new Error("exchange_payload_not_object");
    return parsed;
  }

  parseJson(raw: string): unknown {
    if (Buffer.byteLength(raw, "utf8") > this.config.maxBytes) throw new Error("exchange_payload_too_large");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("exchange_payload_malformed_json");
    }
    return parsed;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
