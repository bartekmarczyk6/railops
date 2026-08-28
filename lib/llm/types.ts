export type EmailDraft = {
  subject: string;
  body: string;
  mentionedFacts: string[];
};

export type Claim = {
  kind: string;
  description: string;
  value?: number | null;
  ticketNumber?: string | null;
};

export type DecisionBasis = {
  claim: string;
  evidenceRef: string;
  note: string;
};

export type CriticFinding = {
  severity: "info" | "warning" | "error";
  message: string;
  evidenceRef?: string | null;
};

export type ExtractedClaims = {
  requestedAction: string;
  claims: Claim[];
  missingFields: string[];
  referencedTicketNumbers: string[];
  referencedStations: string[];
};

export type DecisionOutcome =
  | "refund"
  | "change"
  | "follow_up"
  | "unsupported_or_escalate"
  | "information";

export type DecisionDraft = {
  outcome: DecisionOutcome;
  proposedAmount: number | null;
  decisionBasis: DecisionBasis[];
  response: string;
  evidenceRefs: string[];
};

export type CritiqueReport = {
  passed: boolean;
  findings: CriticFinding[];
  correctedDraft: DecisionDraft | null;
};

export type FollowUpIntent = "answer" | "question" | "unclear";

export type FollowUpAnswer = {
  field: string;
  value: string;
};

export type FollowUpInterpretation = {
  intent: FollowUpIntent;
  answers: FollowUpAnswer[];
};

export type FollowUpDraft = {
  message: string;
  requestedFields: string[];
};
