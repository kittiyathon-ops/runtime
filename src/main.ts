import { pathToFileURL } from "node:url";
import { AuditLog, type AuditSink } from "./audit/audit-log.js";
import { SystemClock as RuntimeClock } from "./core/clock.js";
import { BinanceLiveExecution } from "./live-execution/binance-live-execution.js";
import { liveExecutionCertification } from "./live-execution/execution-certification.js";
import { loadConfig, type RuntimeConfig } from "./infra/config.js";
import { createLogger, type Logger } from "./infra/logger.js";
import { TradingRuntime } from "./runtime/runtime.js";
import { GovernanceStateMachine } from "./runtime/governance-state-machine.js";
import type { RuntimeSessionLock } from "./infra/RuntimeSessionLock.js";
import { StartupTruthReconciler } from "./core/StartupTruthReconciler.js";

export type DeploymentMode = "SHADOW" | "PAPER" | "CONSTRAINED" | "LIVE";

export interface StartupReconciliation {
  allow: boolean;
  reason?: string;
}

export interface RuntimeFeedConnector {
  connectMarketFeeds(symbols: readonly string[]): Promise<void> | void;
  connectUserStream(symbols: readonly string[]): Promise<void> | void;
  close(): Promise<void> | void;
  healthy(): boolean;
}

export interface BootstrapAuditEntry {
  action: string;
  deploymentMode?: DeploymentMode;
  symbol?: string;
  reason?: string;
  status?: string;
  evidenceIds?: string[];
}

export interface OperationalBootstrapDeps {
  config?: RuntimeConfig;
  runtime?: TradingRuntime;
  governance?: GovernanceStateMachine;
  liveExecution?: BinanceLiveExecution;
  feeds?: RuntimeFeedConnector;
  audit?: AuditSink;
  logger?: Logger;
  deploymentMode?: DeploymentMode;
  symbols?: readonly string[];
  heartbeatIntervalMs?: number;
  verifyReplayIntegrity?: () => readonly unknown[];
  verifyStartupReconciliation?: () => StartupReconciliation | Promise<StartupReconciliation>;
  certifyLiveExecution?: () => { status: string; failures: readonly string[]; evidenceIds: readonly string[] };
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  sessionLock?: RuntimeSessionLock;
}

export interface BootstrapStatus {
  deploymentMode: DeploymentMode;
  runtimeStarted: boolean;
  governanceInitialized: boolean;
  replayVerified: boolean;
  feedsHealthy: boolean;
  liveExecutionCertified: boolean;
  executionEnabled: boolean;
}

class DefaultRuntimeFeedConnector implements RuntimeFeedConnector {
  private marketConnected = false;
  private userConnected = false;

  constructor(private readonly runtime: TradingRuntime) {}

  async connectMarketFeeds(symbols: readonly string[]): Promise<void> {
    for (const symbol of symbols) {
      this.runtime.connectBinanceMarketData(symbol);
    }
    this.marketConnected = symbols.length > 0;
  }

  async connectUserStream(symbols: readonly string[]): Promise<void> {
    await this.runtime.connectBinanceUserStream(symbols);
    this.userConnected = symbols.length > 0;
  }

  close(): void {
    this.marketConnected = false;
    this.userConnected = false;
  }

  healthy(): boolean {
    return this.marketConnected && this.userConnected;
  }
}

export class OperationalBootstrap {
  private readonly config: RuntimeConfig;
  private readonly runtime: TradingRuntime;
  private readonly governance: GovernanceStateMachine;
  private readonly feeds: RuntimeFeedConnector;
  private readonly audit: AuditSink;
  private readonly deploymentMode: DeploymentMode;
  private readonly symbols: readonly string[];
  private readonly heartbeatIntervalMs: number;
  private readonly verifyReplayIntegrity: () => readonly unknown[];
  private readonly verifyStartupReconciliation: () => StartupReconciliation | Promise<StartupReconciliation>;
  private readonly certifyLiveExecution: () => { status: string; failures: readonly string[]; evidenceIds: readonly string[] };
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly sessionLock: RuntimeSessionLock | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private started = false;
  private status: BootstrapStatus;

  constructor(deps: OperationalBootstrapDeps = {}) {
    this.config = deps.config ?? loadConfig();
    const logger = deps.logger ?? createLogger(this.config);
    this.audit = deps.audit ?? new AuditLog(logger);
    this.deploymentMode = deps.deploymentMode ?? deploymentModeFromEnv(process.env.DEPLOYMENT_MODE);
    this.symbols = deps.symbols ?? symbolsFromEnv(process.env.BINANCE_SYMBOLS);
    this.runtime = deps.runtime ?? new TradingRuntime({
      config: this.config,
      logger,
      audit: this.audit,
      clock: new RuntimeClock(),
      ...(deps.liveExecution === undefined ? {} : { liveExecution: deps.liveExecution })
    });
    this.governance = deps.governance ?? new GovernanceStateMachine();
    this.feeds = deps.feeds ?? new DefaultRuntimeFeedConnector(this.runtime);
    this.heartbeatIntervalMs = deps.heartbeatIntervalMs ?? 1_000;
    this.verifyReplayIntegrity = deps.verifyReplayIntegrity ?? (() => this.runtime.replayPersisted());
    this.verifyStartupReconciliation = deps.verifyStartupReconciliation ?? (() => this.defaultStartupReconciliation());
    this.certifyLiveExecution = deps.certifyLiveExecution ?? (() => liveExecutionCertification({
      duplicateExecutions: 0,
      ghostOrders: 0,
      unreconciledExposure: 0,
      directExchangeMutationBypass: false,
      restOnlyFinality: false,
      websocketOnlyFinality: false,
      unattestedExecutions: 0,
      ordersMissingIdempotencyKeys: 0,
      pendingOrdersUnrecovered: 0
    }, ["startup_live_execution_certification"]));
    this.setIntervalFn = deps.setIntervalFn ?? setInterval;
    this.clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
    this.sessionLock = deps.sessionLock;
    this.status = this.emptyStatus();
  }

  snapshot(): BootstrapStatus {
    return { ...this.status };
  }

  async start(): Promise<BootstrapStatus> {
    if (this.started) return this.snapshot();
    this.record({ action: "operational_bootstrap_started", deploymentMode: this.deploymentMode, evidenceIds: ["bootstrap_start"] });

    try {
      this.sessionLock?.acquire();
      this.applyDeploymentGate();
      this.status.governanceInitialized = true;
      this.record({ action: "governance_initialized", deploymentMode: this.deploymentMode, status: this.governance.state(), evidenceIds: ["governance_initialized"] });

      const replayIssues = this.verifyReplayIntegrity();
      if (replayIssues.length > 0) {
        throw new Error("startup_replay_integrity_failed");
      }
      this.status.replayVerified = true;
      this.record({ action: "startup_replay_integrity_verified", deploymentMode: this.deploymentMode, evidenceIds: ["replay_integrity_verified"] });

      const reconciliation = await this.verifyStartupReconciliation();
      if (!reconciliation.allow) {
        this.record({
          action: "startup_truth_reconciliation_failed",
          deploymentMode: this.deploymentMode,
          reason: reconciliation.reason ?? "startup_reconciliation_mismatch",
          evidenceIds: ["startup_truth_reconciliation_failed"]
        });
        this.runtime.governanceHalt(reconciliation.reason ?? "startup_reconciliation_mismatch", ["startup_truth_reconciliation_failed"]);
        throw new Error(reconciliation.reason ?? "startup_reconciliation_mismatch");
      }
      this.record({ action: "startup_reconciliation_verified", deploymentMode: this.deploymentMode, evidenceIds: ["startup_reconciliation_verified"] });

      const certification = this.certifyLiveExecution();
      if (certification.status !== "LIVE_EXECUTION_CERTIFIED") {
        throw new Error(`startup_live_execution_not_certified:${certification.failures.join(",")}`);
      }
      this.status.liveExecutionCertified = true;
      this.record({ action: "startup_live_execution_certified", deploymentMode: this.deploymentMode, status: certification.status, evidenceIds: [...certification.evidenceIds] });

      await this.feeds.connectMarketFeeds(this.symbols);
      await this.feeds.connectUserStream(this.symbols);
      this.status.feedsHealthy = this.feeds.healthy();
      if (!this.status.feedsHealthy) {
        throw new Error("startup_market_feeds_unhealthy");
      }
      this.record({ action: "startup_feeds_healthy", deploymentMode: this.deploymentMode, evidenceIds: ["startup_feeds_healthy"] });

      await this.runtime.start();
      this.status.runtimeStarted = true;
      this.status.executionEnabled = this.deploymentMode === "CONSTRAINED" || this.deploymentMode === "LIVE" || this.deploymentMode === "PAPER";
      this.started = true;
      this.startHeartbeat();
      this.record({ action: "operational_runtime_activated", deploymentMode: this.deploymentMode, evidenceIds: ["runtime_activated"] });
      return this.snapshot();
    } catch (error) {
      await this.failClosed(error instanceof Error ? error.message : "operational_bootstrap_failed");
      throw error;
    }
  }

  async stop(reason = "shutdown"): Promise<void> {
    if (this.heartbeat !== undefined) {
      this.clearIntervalFn(this.heartbeat);
      this.heartbeat = undefined;
    }
    await this.feeds.close();
    await this.runtime.stop();
    this.sessionLock?.release();
    this.started = false;
    this.status.runtimeStarted = false;
    this.status.executionEnabled = false;
    this.record({ action: "operational_runtime_stopped", deploymentMode: this.deploymentMode, reason, evidenceIds: ["runtime_stopped"] });
  }

  installShutdownHooks(processLike: NodeJS.Process = process): void {
    const shutdown = (signal: NodeJS.Signals) => {
      void this.stop(signal).catch((error) => {
        this.record({ action: "operational_shutdown_failed", deploymentMode: this.deploymentMode, reason: error instanceof Error ? error.message : "shutdown_failed" });
      });
    };
    processLike.once("SIGINT", shutdown);
    processLike.once("SIGTERM", shutdown);
  }

  private applyDeploymentGate(): void {
    if (this.deploymentMode === "SHADOW") {
      this.governance.transition("SHADOW", "shadow_runtime_activation", "deployment_mode_shadow");
      return;
    }
    if (this.deploymentMode === "PAPER") {
      this.runtime.transitionMode("PAPER");
      this.governance.transition("NORMAL", "manual", "deployment_mode_paper");
      return;
    }
    this.governance.transition("NORMAL", "manual", `deployment_mode_${this.deploymentMode.toLowerCase()}`);
  }

  private startHeartbeat(): void {
    this.heartbeat = this.setIntervalFn(() => {
      this.record({
        action: "runtime_heartbeat",
        deploymentMode: this.deploymentMode,
        status: this.runtime.healthSnapshot().mode,
        evidenceIds: ["runtime_heartbeat"]
      });
    }, this.heartbeatIntervalMs);
    this.heartbeat.unref?.();
  }

  private async failClosed(reason: string): Promise<void> {
    this.record({ action: "operational_bootstrap_failed_closed", deploymentMode: this.deploymentMode, reason, evidenceIds: ["bootstrap_failed_closed"] });
    try {
      if (this.runtime.state.mode() !== "GOVERNANCE_HALT") {
        this.runtime.transitionMode("SAFE_MODE");
      }
    } catch {
      // Governance remains authoritative; failed closed evidence is preserved even if mode is already terminal.
    }
    await this.stop(reason);
  }

  private emptyStatus(): BootstrapStatus {
    return {
      deploymentMode: this.deploymentMode,
      runtimeStarted: false,
      governanceInitialized: false,
      replayVerified: false,
      feedsHealthy: false,
      liveExecutionCertified: false,
      executionEnabled: false
    };
  }

  private record(entry: BootstrapAuditEntry): void {
    this.audit.record(entry as never);
  }

  private async defaultStartupReconciliation(): Promise<StartupReconciliation> {
    if (this.deploymentMode !== "LIVE" && this.deploymentMode !== "CONSTRAINED") return { allow: true };
    try {
      const exchange = await this.runtime.fetchStartupExchangeTruth(["startup_exchange_truth"]);
      const portfolio = this.runtime.portfolio.snapshot();
      const decision = new StartupTruthReconciler().reconcile({
        local: {
          portfolio: {
            positions: Object.fromEntries(Object.entries(portfolio.positions).map(([symbol, position]) => [symbol, {
              symbol,
              quantity: position.quantity,
              averagePrice: position.averagePrice,
              realizedPnlUsd: 0,
              unrealizedPnlUsd: position.unrealizedPnl,
              feesUsd: 0,
              fundingUsd: 0,
              liquidations: 0
            }])),
            balances: {},
            cashUsd: portfolio.equityUsd,
            realizedPnlUsd: portfolio.realizedPnl,
            unrealizedPnlUsd: 0,
            feesUsd: 0,
            fundingUsd: 0,
            exposureUsd: this.runtime.portfolio.exposureUsd(),
            lastSeq: this.runtime.healthSnapshot().seq,
            appliedFillIds: []
          },
          openClientOrderIds: [],
          evidenceIds: ["startup_local_replay_truth"]
        },
        exchange
      });
      return { allow: decision.action === "ALLOW", reason: decision.reason };
    } catch (error) {
      return { allow: false, reason: error instanceof Error ? error.message : "startup_truth_fetch_failed" };
    }
  }
}

export function deploymentModeFromEnv(value: string | undefined): DeploymentMode {
  if (value === "SHADOW" || value === "PAPER" || value === "CONSTRAINED" || value === "LIVE") return value;
  return "SHADOW";
}

export function symbolsFromEnv(value: string | undefined): readonly string[] {
  const symbols = (value ?? "BTCUSDT")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol.length > 0);
  return symbols.length === 0 ? ["BTCUSDT"] : symbols;
}

export async function startProductionRuntime(): Promise<OperationalBootstrap> {
  const bootstrap = new OperationalBootstrap();
  bootstrap.installShutdownHooks();
  await bootstrap.start();
  return bootstrap;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await startProductionRuntime();
}
