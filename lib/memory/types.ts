export type CaseTopic =
  | "delay_refund"
  | "cancelled_train_refund"
  | "missed_connection"
  | "ticket_change"
  | "passenger_name_change"
  | "missing_refund"
  | "payment_without_ticket"
  | "validation_discount_penalty";

export type LearningOutcome =
  | "refund"
  | "change"
  | "follow_up"
  | "unsupported_or_escalate"
  | "information";

export type ReviewerAction = "approve" | "reject" | "edit";

export type LearningRecord = {
  topic: CaseTopic;
  outcome: LearningOutcome;
  reviewerAction: ReviewerAction;
  feedback?: string;
  originalDraftSummary: string;
  finalDraftSummary: string;
  changedGuidance: string[];
  timestamp: string;
};

export type MemoryContext = {
  topic: CaseTopic;
  reviewerGuidance: string[];
  source: "hindsight" | "none";
};

export type MemoryTraceEvent = {
  kind: "memory_unavailable";
  stage: "recall" | "retain" | "undo" | "init";
  reason: string;
};

export type MemoryTraceListener = (event: MemoryTraceEvent) => void;
