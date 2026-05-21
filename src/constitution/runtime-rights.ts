export type RuntimeRight =
  | "right_to_fail_closed"
  | "right_to_preserve_evidence"
  | "right_to_reject_temporal_uncertainty"
  | "right_to_require_human_review"
  | "right_to_degrade_before_execute";

export const RUNTIME_RIGHTS: readonly RuntimeRight[] = Object.freeze([
  "right_to_fail_closed",
  "right_to_preserve_evidence",
  "right_to_reject_temporal_uncertainty",
  "right_to_require_human_review",
  "right_to_degrade_before_execute"
]);
