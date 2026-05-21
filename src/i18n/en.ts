export const en = {
  runtimeStarted: "Runtime started",
  runtimeStopped: "Runtime stopped",
  safeMode: "⚠️ SAFE_MODE activated",
  orderSubmitted: "Order submitted",
  orderFilled: "✅ Order filled",
  websocketDisconnected: "WebSocket disconnected",
  websocketReconnecting: "WebSocket reconnecting",
  runtimeError: "❌ Runtime error",
  riskLimitHit: "Risk limit hit",
  dailyPnl: (pnl: number) => `Daily PnL: ${pnl.toFixed(2)} USD`,
  pnlUpdate: (pnl: number) => `Current PnL: ${pnl.toFixed(2)} USD`
};
