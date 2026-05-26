import test from "node:test";
import assert from "node:assert/strict";

import {
  fetchBinanceKlines
} from "../src/alpha/historical-data-loader.js";

test("historical loader returns normalized candles", async () => {

  const candles =
    await fetchBinanceKlines({
      symbol: "ETHUSDT",
      interval: "1m",
      limit: 5
    });

  assert.equal(candles.length, 5);

  for (const candle of candles) {
    assert.equal(typeof candle.open, "number");
    assert.equal(typeof candle.close, "number");
    assert.equal(typeof candle.volume, "number");
  }
});
