import type { LearningRecord } from "../memory/types.js";

export type { LearningRecord };

export const CURRENT_SCHEMA_VERSION = 2 as const;

export type ReviewAction = "approve" | "reject" | "edit";

export type ReviewRecord = {
  action: ReviewAction;
  reviewer: string;
  feedback: string | null;
  editedOutcome: string | null;
  editedAmount: number | null;
  timestamp: string;
};

export type CaseState =
  | "created"
  | "running"
  | "reviewable"
  | "approved"
  | "rejected"
  | "escalated"
  | "revising"
  | "learning_saved"
  | "error";

export type PipelineStage =
  | "reading_email"
  | "locating_account"
  | "generating_email"
  | "extracting_claims"
  | "retrieving_knowledge"
  | "checking_records"
  | "evaluating_rules"
  | "drafting"
  | "critiquing"
  | "reviewable"
  | "revising"
  | "learning_saved";

export type TraceStatus = "started" | "completed" | "failed";

export type TraceEvent = {
  id: string;
  caseId: string;
  runId: string;
  sequence: number;
  stage: PipelineStage;
  status: TraceStatus;
  summary: string;
  functionName: string | null;
  recordRefs: string[];
  evidenceRefs: string[];
  durationMs: number | null;
  error: string | null;
  timestamp: string;
  payload?: unknown;
};

export type DemoCasePackage = import("../domain/types.js").DemoCasePackage;

export type StoredEmail = {
  from: string;
  subject: string;
  body: string;
  mentionedFacts: string[];
  receivedAt: string;
};

export type StoredCase = {
  caseId: string;
  topic: string;
  truthMode: string;
  state: CaseState;
  createdAt: string;
  updatedAt: string;
  seed: number;
  pkg: DemoCasePackage;
  trace: TraceEvent[];
  reviewHistory: ReviewRecord[];
  learningRef: string | null;
  email: StoredEmail | null;
  emailError: string | null;
  supplements: Record<string, string>;
  version: number;
};

export type AppState = {
  schemaVersion: number;
  cases: StoredCase[];
  events: TraceEvent[];
  learning: LearningRecord[];
};

export function emptyAppState(): AppState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    cases: [],
    events: [],
    learning: [],
  };
}
