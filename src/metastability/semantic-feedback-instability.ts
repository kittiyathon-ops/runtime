export function semanticFeedbackInstability(feedbackAmplification: number, evidenceIds: string[]) {
  if (feedbackAmplification < 0 || evidenceIds.length === 0) throw new Error("semantic_feedback_requires_evidence");
  return { status: feedbackAmplification >= 1 ? "AMPLIFYING" as const : "BOUNDED" as const, feedbackAmplification, evidenceIds: [...evidenceIds] };
}
