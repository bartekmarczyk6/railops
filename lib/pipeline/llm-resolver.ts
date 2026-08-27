import type {
  EmailDraft,
  ExtractedClaims,
  DecisionDraft,
  CritiqueReport,
} from "../llm/types.ts";
import type { LlmClient } from "./run-case.ts";
import {
  generateCustomerEmail,
  extractCaseClaims,
  draftDecision,
  critiqueDecision,
} from "../llm/baml.ts";
import type {
  GenerateEmailInput,
  ExtractClaimsInput,
  DraftDecisionInput,
  CritiqueDecisionInput,
} from "../llm/baml.ts";

const FAKE_EMAIL: EmailDraft = {
  subject: "Delay refund request",
  body: "My train was delayed. Please refund.",
  mentionedFacts: ["record:ticket:TKT-000001"],
};

const FAKE_CLAIMS: ExtractedClaims = {
  requestedAction: "refund",
  claims: [{ kind: "delay_minutes", description: "Claimed 45 minute delay", value: 45 }],
  missingFields: [],
  referencedTicketNumbers: ["TKT-000001"],
  referencedStations: ["Warszawa Centralna", "Krakow Glowny"],
};

const FAKE_DRAFT: DecisionDraft = {
  outcome: "information",
  proposedAmount: null,
  decisionBasis: [
    { claim: "synthetic", evidenceRef: "record:ticket:TKT-000001", note: "stub" },
  ],
  response: "Stub response for local demo.",
  evidenceRefs: ["record:ticket:TKT-000001"],
};

const FAKE_CRITIQUE: CritiqueReport = {
  passed: true,
  findings: [],
  correctedDraft: null,
};

function makeFakeLlm(): LlmClient {
  return {
    generateCustomerEmail: async () => ({ ...FAKE_EMAIL }),
    extractCaseClaims: async () => ({ ...FAKE_CLAIMS }),
    draftDecision: async () => ({ ...FAKE_DRAFT }),
    critiqueDecision: async () => ({ ...FAKE_CRITIQUE }),
  };
}

function makeRealLlm(): LlmClient {
  return {
    generateCustomerEmail: (input, signal) => generateCustomerEmail(input, signal),
    extractCaseClaims: (input, signal) => extractCaseClaims(input, signal),
    draftDecision: (input, signal) => draftDecision(input, signal),
    critiqueDecision: (input, signal) => critiqueDecision(input, signal),
  };
}

let cached: LlmClient | null = null;

export function getLlmClient(): LlmClient {
  if (cached) return cached;
  if (process.env.RAILOPS_FAKE_LLM === "1") {
    cached = makeFakeLlm();
    return cached;
  }
  cached = makeRealLlm();
  return cached;
}

export function resetLlmClientForTesting(): void {
  cached = null;
}

export type {
  GenerateEmailInput,
  ExtractClaimsInput,
  DraftDecisionInput,
  CritiqueDecisionInput,
};
