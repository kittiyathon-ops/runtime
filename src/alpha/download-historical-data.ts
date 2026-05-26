import { writeFile } from "node:fs/promises";

import {
  fetchBinanceKlines
} from "./historical-data-loader.js";

async function main(): Promise<void> {

  console.log(
    "Fetching deterministic Binance historical dataset..."
  );

  const klines =
    await fetchBinanceKlines({
      symbol: "ETHUSDT",
      interval: "1m",
      limit: 500
    });

  const outputPath =
    "data/historical/ETHUSDT_1m.json";

  await writeFile(
    outputPath,
    JSON.stringify(klines, null, 2),
    "utf8"
  );

  console.log(
    `Historical dataset saved: ${outputPath}`
  );

  console.log(
    `Candles fetched: ${klines.length}`
  );
}

await main();
