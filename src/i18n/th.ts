export const th = {
  runtimeStarted: "Runtime เริ่มทำงานแล้ว",
  runtimeStopped: "Runtime หยุดทำงาน",
  safeMode: "⚠️ ระบบเข้า SAFE MODE",
  orderSubmitted: "ส่งคำสั่ง Order แล้ว",
  orderFilled: "✅ Order Filled",
  websocketDisconnected: "WebSocket หลุด",
  websocketReconnecting: "WebSocket กำลัง reconnect",
  runtimeError: "❌ Runtime Error",
  riskLimitHit: "แตะ Risk Limit",
  dailyPnl: (pnl: number) => `Daily PnL: ${pnl.toFixed(2)} USD`,
  pnlUpdate: (pnl: number) => `PnL ปัจจุบัน: ${pnl.toFixed(2)} USD`
};
