import type { RuntimeEvent } from "../core/event.js";
import { CANONICAL_EVENT_CONTRACTS, type CanonicalEventContract } from "./canonical-events.js";
import type { CanonicalEventType } from "./event-types.js";
import { evaluateSchemaCompatibility, type SchemaCompatibilityResult } from "./schema-evolution.js";

export class EventSchemaRegistry {
  private readonly contracts = new Map<string, CanonicalEventContract>();

  constructor(contracts: CanonicalEventContract[] = CANONICAL_EVENT_CONTRACTS) {
    for (const contract of contracts) this.register(contract);
  }

  register(contract: CanonicalEventContract): void {
    this.contracts.set(this.key(contract.eventType, contract.version), contract);
  }

  lookup(eventType: CanonicalEventType, version: number): CanonicalEventContract | undefined {
    return this.contracts.get(this.key(eventType, version));
  }

  validate(event: RuntimeEvent, version = 1): RuntimeEvent {
    const contract = this.lookup(event.eventType as CanonicalEventType, version);
    if (contract === undefined) throw new Error(`event_contract_missing:${event.eventType}:v${version}`);
    contract.payloadSchema.parse(event.payload);
    return event;
  }

  compatibility(eventType: CanonicalEventType, fromVersion: number, toVersion: number): SchemaCompatibilityResult {
    if (this.lookup(eventType, fromVersion) === undefined || this.lookup(eventType, toVersion) === undefined) {
      return { compatible: false, mode: "none", reason: "event_contract_missing" };
    }
    return evaluateSchemaCompatibility(fromVersion, toVersion);
  }

  private key(eventType: CanonicalEventType, version: number): string {
    return `${eventType}:v${version}`;
  }
}
