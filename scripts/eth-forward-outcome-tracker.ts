import fs from "node:fs";
import path from "node:path";

type ScanRecord = {
  timestamp?: string;
  symbol?: string;
  market?: {
    ethPrice?: number;
  };
  confluenceScore?: {
    total?: number;
    threshold?: number;
    tradeWorthy?: boolean;
    hardVeto?: {
      blocked?: boolean;
      reasons?: string[];
    };
  };
  decision?: {
    allowTrade?: boolean;
    reason?: string;
    regime?: string;
  };
};

type OutcomeRecord = ScanRecord & {
  outcome?: {
    baseTimestamp: string;
    baseEthPrice: number;
    checkedAt: string;
    ageMs: number;
    currentEthPrice: number;
    moveBps: number;
    horizon: "5m" | "15m" | "30m";
    direction: "UP" | "DOWN" | "FLAT";
    hypotheticalSide: "LONG" | "SHORT" | "NONE";
    wouldHaveWon: boolean | null;
  };
};

const HISTORY_FILE = path.join("data", "eth-market-history.jsonl");
const OUTCOME_FILE = path.join("data", "eth-forward-outcomes.jsonl");

const HORIZONS = [
  { name: "5m" as const, ms: 5 * 60 * 1000 },
  { name: "15m" as const, ms: 15 * 60 * 1000 },
  { name: "30m" as const, ms: 30 * 60 * 1000 }
];

async function getCurrentEthPrice(): Promise<number> {
  const url = "https://fapi.binance.com/fapi/v1/ticker/price?symbol=ETHUSDT";
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`ETH_PRICE_FETCH_FAILED_${res.status}`);
  }

  const data = await res.json() as { price: string };
  const price = Number(data.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("INVALID_ETH_PRICE");
  }

  return price;
}

function readJsonl(file: string): unknown[] {
  if (!fs.existsSync(file)) return [];

  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as unknown);
}

function appendJsonl(file: string, entry: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(entry) + "\n");
}

function keyFor(record: ScanRecord, horizon: string): string {
  return `${record.timestamp ?? "NO_TIME"}:${horizon}`;
}

function moveBps(from: number, to: number): number {
  return ((to - from) / from) * 10000;
}

function directionFromMove(bps: number): "UP" | "DOWN" | "FLAT" {
  if (bps > 1) return "UP";
  if (bps < -1) return "DOWN";
  return "FLAT";
}

function hypotheticalSide(record: ScanRecord): "LONG" | "SHORT" | "NONE" {
  const reason = record.decision?.reason ?? "";
  const align = record.confluenceScore?.tradeWorthy === true;

  if (!align) return "NONE";

  if (reason.includes("SHORT")) return "SHORT";
  if (reason.includes("LONG")) return "LONG";

  return "LONG";
}

function wouldHaveWon(side: "LONG" | "SHORT" | "NONE", bps: number): boolean | null {
  if (side === "NONE") return null;
  if (side === "LONG") return bps > 0;
  if (side === "SHORT") return bps < 0;
  return null;
}

function validScanRecord(value: unknown): value is ScanRecord {
  const record = value as ScanRecord;

  return (
    typeof record === "object" &&
    record !== null &&
    typeof record.timestamp === "string" &&
    record.symbol === "ETHUSDT" &&
    typeof record.market?.ethPrice === "number" &&
    Number.isFinite(record.market.ethPrice)
  );
}

async function main(): Promise<void> {
  const now = new Date();
  const nowMs = now.getTime();

  const history = readJsonl(HISTORY_FILE).filter(validScanRecord);
  const existingOutcomes = readJsonl(OUTCOME_FILE) as OutcomeRecord[];

  const doneKeys = new Set(
    existingOutcomes
      .filter(item => typeof item.timestamp === "string" && item.outcome?.horizon)
      .map(item => keyFor(item, item.outcome!.horizon))
  );

  const currentEthPrice = await getCurrentEthPrice();

  let written = 0;

  for (const record of history) {
    const recordTime = new Date(record.timestamp!);
    const recordMs = recordTime.getTime();

    if (!Number.isFinite(recordMs)) continue;

    const ageMs = nowMs - recordMs;
    if (ageMs < 0) continue;

    for (const horizon of HORIZONS) {
      const key = keyFor(record, horizon.name);

      if (doneKeys.has(key)) continue;
      if (ageMs < horizon.ms) continue;

      const baseEthPrice = record.market!.ethPrice!;
      const bps = moveBps(baseEthPrice, currentEthPrice);
      const direction = directionFromMove(bps);
      const side = hypotheticalSide(record);

      const outcome: OutcomeRecord = {
        ...record,
        outcome: {
          baseTimestamp: record.timestamp!,
          baseEthPrice,
          checkedAt: now.toISOString(),
          ageMs,
          currentEthPrice,
          moveBps: Number(bps.toFixed(4)),
          horizon: horizon.name,
          direction,
          hypotheticalSide: side,
          wouldHaveWon: wouldHaveWon(side, bps)
        }
      };

      appendJsonl(OUTCOME_FILE, outcome);
      doneKeys.add(key);
      written += 1;
    }
  }

  console.log(JSON.stringify({
    result: "ETH_FORWARD_OUTCOME_TRACKER_OK",
    historyFile: HISTORY_FILE,
    outcomeFile: OUTCOME_FILE,
    historyRecords: history.length,
    written,
    currentEthPrice
  }, null, 2));
}

main().catch(err => {
  console.error("ETH_FORWARD_OUTCOME_TRACKER_FAILED");
  console.error(err);
  process.exit(1);
});