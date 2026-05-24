import { loadConfig } from "../src/infra/config.js";
import { EthAdaptiveStrategy } from "../src/strategies/eth-adaptive-strategy.js";

const config = loadConfig(process.env);
const strategy = new EthAdaptiveStrategy();

function fail(reason: string): never {
  console.log(JSON.stringify({
    result: "ETH_ADAPTIVE_LIVE_PRETRADE_BLOCKED",
    reason,
    restOrderSent: false
  }, null, 2));
  process.exit(1);
}

if (config.runtimeProfile !== "LIVE") fail("RUNTIME_PROFILE_NOT_LIVE");
if (config.dryRun) fail("DRY_RUN_MUST_BE_FALSE_FOR_LIVE_PREFLIGHT");
if (!config.killSwitch) fail("KEEP_KILL_SWITCH_TRUE_FOR_PREFLIGHT_ONLY");
if (!config.binanceSymbols.includes("ETHUSDT")) fail("BINANCE_SYMBOLS_MUST_INCLUDE_ETHUSDT");

const decision = strategy.evaluate({
  ethPrice: 3000,
  btcPrice: 76000,
  ethVolume: 130,
  avgVolume: 100,
  spreadBps: 3,
  volatilityBps: 90,
  wickRatio: 0.32,
  breakoutDetected: false,
  followThrough: true,
  liquiditySweep: true,
  reclaimDetected: true,
  btcTrend: "LONG",
  ethTrend: "LONG",
  failedSignals: 0
}, Date.now());

console.log(JSON.stringify({
  result: "ETH_ADAPTIVE_LIVE_PRETRADE_GATE_OK",
  runtimeProfile: config.runtimeProfile,
  dryRun: config.dryRun,
  killSwitch: config.killSwitch,
  symbol: "ETHUSDT",
  restOrderSent: false,
  decision
}, null, 2));