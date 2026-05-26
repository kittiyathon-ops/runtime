import { readFile } from "node:fs/promises";

import type {
  BinanceKline
} from "./historical-data-loader.js";

import {
  extractMarketFeatures
} from "./market-feature-extractor.js";

async function main(): Promise<void> {
  const raw = await readFile(
    "data/historical/ETHUSDT_1m.json",
    "utf8"
  );

  const candles = JSON.parse(raw) as BinanceKline[];
  const vectors = extractMarketFeatures(candles);

  console.log("Market features extracted:");
  console.log(JSON.stringify(vectors.slice(0, 5), null, 2));
  console.log(`Feature vectors: ${vectors.length}`);
}

await main();
