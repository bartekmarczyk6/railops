export const POLICY_VERSION = "1.0.0" as const;

export type PolicyVersion = typeof POLICY_VERSION;

export type RuleOutcome =
  | "eligible"
  | "not_eligible"
  | "follow_up_required"
  | "escalate";

export type RuleReason = {
  code: string;
  description: string;
  policyVersion: PolicyVersion;
};

export type RuleEvaluation = {
  outcome: RuleOutcome;
  amount: number | null;
  reasons: RuleReason[];
  evidenceRefs: string[];
};

export type Claim = {
  field: string;
  value: string;
};

export type ExtractedClaims = {
  requestedAction: string;
  claims: Claim[];
  missingFields: string[];
  referencedTicketNumbers: string[];
  referencedStations: string[];
};

export type DecisionBasis = {
  code: string;
  description: string;
  evidenceRefs: string[];
};

export type DecisionDraft = {
  outcome: "refund" | "change" | "follow_up" | "unsupported_or_escalate" | "information";
  proposedAmount: number | null;
  decisionBasis: DecisionBasis[];
  response: string;
  evidenceRefs: string[];
};
