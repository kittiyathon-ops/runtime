export function degradedReplay(reconnectsBounded: boolean, partitionsBounded: boolean, delayedAcksBounded: boolean, pressureBounded: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("degraded_replay_requires_evidence");
  const stable = reconnectsBounded && partitionsBounded && delayedAcksBounded && pressureBounded;
  return {
    status: stable ? "DEGRADED_REPLAY_CERTIFIABLE" as const : "DEGRADED_REPLAY_FAIL_CLOSED" as const,
    reconnectsBounded,
    partitionsBounded,
    delayedAcksBounded,
    pressureBounded,
    evidenceIds: [...evidenceIds]
  };
}
