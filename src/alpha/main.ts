import { AlphaConfig } from "./alpha-config.js";
import { DataLayer } from "./data-layer.js";
import { HypothesisEngine } from "./hypothesis-engine.js";
import { Validator } from "./validator.js";

async function main(): Promise<void> {
  console.log("AlphaLab initializing...");

  const config = new AlphaConfig();

  console.log("[1/3] Building deterministic dataset...");
  const dataLayer = new DataLayer(config.data);
  const dataset = dataLayer.buildMultiTimeframeDataset();

  console.log("[2/3] Generating hypotheses...");
  const hypothesisEngine = new HypothesisEngine(config.hypothesis);
  const hypotheses = hypothesisEngine.generateBatch({
    symbols: config.data.symbols,
    timeframes: config.data.timeframes,
    count: config.hypothesis.batchSize
  });

  console.log(`[3/3] Validating ${hypotheses.length} hypotheses...`);
  const validator = new Validator(config.validation);

  let passed = 0;

  for (const hypothesis of hypotheses) {
    const key = `${hypothesis.symbol}_${hypothesis.timeframe}`;
    const candles = dataset.get(key);

    if (candles === undefined) {
      console.log(`${hypothesis.id}: SKIPPED no data`);
      continue;
    }

    const result = validator.validateHypothesis({
      candles,
      hypothesis
    });

    if (result.passed) passed += 1;

    console.log(
      `${hypothesis.id}: ${result.passed ? "PASSED" : "FAILED"} | ` +
      `trades=${result.metrics.trades} | ` +
      `sharpe=${result.metrics.sharpeRatio.toFixed(2)} | ` +
      `expectancy=${result.metrics.netExpectancyPct.toFixed(4)}%`
    );
  }

  console.log(`AlphaLab complete: ${passed}/${hypotheses.length} hypotheses passed`);
}

await main();
