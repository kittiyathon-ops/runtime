import test from "node:test";
import assert from "node:assert/strict";

import { AlphaConfig } from "../src/alpha/alpha-config.js";
import { DataLayer } from "../src/alpha/data-layer.js";
import { HypothesisEngine } from "../src/alpha/hypothesis-engine.js";
import { Validator } from "../src/alpha/validator.js";

test("AlphaLab builds deterministic dataset", () => {
  const config = new AlphaConfig();
  const dataLayer = new DataLayer(config.data);

  assert.deepEqual(
    dataLayer.buildMultiTimeframeDataset(),
    dataLayer.buildMultiTimeframeDataset()
  );
});

test("AlphaLab generates deterministic hypotheses", () => {
  const config = new AlphaConfig();
  const engine = new HypothesisEngine(config.hypothesis);

  assert.deepEqual(
    engine.generateBatch({ symbols: config.data.symbols, timeframes: config.data.timeframes, count: 5 }),
    engine.generateBatch({ symbols: config.data.symbols, timeframes: config.data.timeframes, count: 5 })
  );
});

test("AlphaLab validates hypothesis without execution side effects", () => {
  const config = new AlphaConfig();
  const dataLayer = new DataLayer(config.data);
  const dataset = dataLayer.buildMultiTimeframeDataset();
  const engine = new HypothesisEngine(config.hypothesis);
  const hypothesis = engine.generateBatch({
    symbols: config.data.symbols,
    timeframes: config.data.timeframes,
    count: 1
  })[0];

  assert.ok(hypothesis);

  const candles = dataset.get(`${hypothesis.symbol}_${hypothesis.timeframe}`);
  assert.ok(candles);

  const result = new Validator(config.validation).validateHypothesis({
    candles,
    hypothesis
  });

  assert.equal(result.hypothesisId, hypothesis.id);
  assert.equal(typeof result.passed, "boolean");
});
