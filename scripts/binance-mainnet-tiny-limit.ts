import { loadConfig } from "../src/infra/config.js";
import { BinanceRest, BinanceRestError } from "../src/adapters/binance/binance-rest.js";
import {
  MainnetTinyRefusal,
  executeMainnetTinyOrder,
  mainnetExchangeErrorPayload,
  mainnetTinyRefusalPayload
} from "../src/live-execution/mainnet-tiny-order.js";

const config = loadConfig(process.env);
const rest = new BinanceRest({
  baseUrl: config.binanceFuturesRestUrl,
  apiKey: config.binanceApiKey,
  apiSecret: config.binanceApiSecret,
  useTestnet: false
});

try {
  const accepted = await executeMainnetTinyOrder({ config, env: process.env, rest });
  console.log(JSON.stringify({
    result: accepted.result,
    orderAccepted: true,
    orderPlaced: true,
    newOrderCalled: true,
    orderId: accepted.orderId,
    clientOrderId: accepted.plan.clientOrderId,
    symbol: accepted.plan.symbol,
    side: accepted.plan.side,
    type: accepted.plan.type,
    timeInForce: accepted.plan.timeInForce,
    status: accepted.exchangeResponse.status,
    quantity: accepted.plan.quantity,
    price: accepted.plan.price,
    notional: accepted.plan.notional,
    executedQty: accepted.exchangeResponse.executedQty ?? "UNKNOWN",
    cleanupRequired: accepted.cleanupRequired,
    finalRuntimeSafetyState: accepted.cleanupRequired
      ? "MAINNET_ORDER_ACCEPTED_CLEANUP_REQUIRED"
      : "MAINNET_ORDER_ACCEPTED_TERMINAL_STATUS",
    postOrderReconciled: accepted.reconciliationOpenOrderFound,
    persistenceCheckpointIntegrated: accepted.readiness.persistenceCheckpointIntegrated,
    persistenceCheckpointRisk: "standalone_script_does_not_write_runtime_checkpoint",
    safeForRepeatedMainnetExecutions: accepted.safeForRepeatedMainnetExecutions,
    cancelCommand: accepted.cancelCommand,
    preflight: {
      endpoint: rest.baseUrl(),
      symbol: accepted.plan.symbol,
      side: accepted.plan.side,
      type: accepted.plan.type,
      timeInForce: accepted.plan.timeInForce,
      quantity: accepted.plan.quantity,
      price: accepted.plan.price,
      notional: accepted.plan.notional,
      leverage: accepted.readiness.leverage,
      openOrdersCount: accepted.readiness.openOrdersCount,
      positionAmount: accepted.readiness.positionAmount,
      maxOrderNotional: String(config.maxOrderNotionalUsd),
      maxExposure: String(config.maxExposureUsd),
      killSwitch: config.killSwitch,
      runtimeProfile: config.runtimeProfile,
      dryRun: config.dryRun,
      binanceUseTestnet: config.binanceUseTestnet,
      clientOrderId: accepted.plan.clientOrderId,
      reduceOnly: false,
      reduceOnlyReason: "entry_order_reduceOnly_false_by_design",
      clockOffsetMs: accepted.readiness.clockOffsetMs,
      positionMode: accepted.readiness.positionMode,
      priceSource: accepted.plan.priceSource
    },
    exchangeResponse: accepted.exchangeResponse,
    rateLimits: rest.rateLimitSnapshot()
  }, null, 2));
  if (accepted.cancelCommand !== undefined) {
    console.error(`MAINNET_CLEANUP_REQUIRED: ${accepted.cancelCommand}`);
  }
} catch (error) {
  if (error instanceof MainnetTinyRefusal) {
    console.error(JSON.stringify(mainnetTinyRefusalPayload(error.reason, error.context), null, 2));
    process.exit(1);
  }
  if (error instanceof BinanceRestError) {
    console.error(JSON.stringify({
      ...mainnetExchangeErrorPayload(error, "MAINNET_TINY_LIMIT_EXCHANGE_REJECTED"),
      orderAccepted: false,
      orderPlaced: false,
      newOrderCalled: false,
      rateLimits: rest.rateLimitSnapshot()
    }, null, 2));
    process.exit(1);
  }
  throw error;
}
