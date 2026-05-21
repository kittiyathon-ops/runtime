export function replayCompressionCertifier(boundaryStatus: string, causalStatus: string, equivalenceStatus: string, governanceMeaningChanged: boolean, evidenceIds: string[]) {
  if (evidenceIds.length === 0) throw new Error("replay_compression_certifier_requires_evidence");
  const certified = boundaryStatus === "COMPRESSION_BOUNDARY_PRESERVED" && causalStatus === "CAUSAL_MEANING_PRESERVED" && equivalenceStatus === "REPLAY_EQUIVALENT" && !governanceMeaningChanged;
  return {
    status: certified ? "REPLAY_COMPRESSION_CERTIFIED" as const : "REPLAY_COMPRESSION_REQUIRES_RISK_REPORT" as const,
    certified,
    compressionApplied: false,
    evidenceIds: [...evidenceIds]
  };
}
