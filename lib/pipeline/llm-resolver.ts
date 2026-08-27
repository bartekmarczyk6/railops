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
  streamGenerateCustomerEmail,
  streamDraftDecision,
  rewriteResponseText,
} from "../llm/baml.ts";
import type {
  GenerateEmailInput,
  ExtractClaimsInput,
  DraftDecisionInput,
  CritiqueDecisionInput,
  RewriteTextInput,
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

const FAKE_OUTCOME_BAML: Record<DecisionDraft["outcome"], string> = {
  refund: "Refund",
  change: "Change",
  follow_up: "FollowUp",
  unsupported_or_escalate: "UnsupportedOrEscalate",
  information: "Information",
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function emitGrowingPartials(
  text: string,
  emit: (partial: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const steps = 5;
  for (let step = 1; step <= steps; step += 1) {
    if (signal?.aborted) throw new Error("aborted");
    await delay(80);
    if (signal?.aborted) throw new Error("aborted");
    emit(text.slice(0, Math.max(1, Math.ceil((text.length * step) / steps))));
  }
}

function makeFakeLlm(): LlmClient {
  return {
    generateCustomerEmail: async () => ({ ...FAKE_EMAIL }),
    extractCaseClaims: async () => ({ ...FAKE_CLAIMS }),
    draftDecision: async () => ({ ...FAKE_DRAFT }),
    critiqueDecision: async () => ({ ...FAKE_CRITIQUE }),
    rewriteResponseText: async (input) => ({
      rewrittenSelection: `[${input.instruction}] ${input.selection}`,
    }),
    streamGenerateCustomerEmail: async (_input, onPartial, signal) => {
      await emitGrowingPartials(
        FAKE_EMAIL.body,
        (body) => onPartial({ subject: FAKE_EMAIL.subject, body }),
        signal,
      );
      return { ...FAKE_EMAIL };
    },
    streamDraftDecision: async (_input, onPartial, signal) => {
      await emitGrowingPartials(
        FAKE_DRAFT.response,
        (response) =>
          onPartial({
            response,
            outcome: FAKE_OUTCOME_BAML[FAKE_DRAFT.outcome],
            proposedAmount: FAKE_DRAFT.proposedAmount,
          }),
        signal,
      );
      return { ...FAKE_DRAFT };
    },
  };
}

function makeRealLlm(): LlmClient {
  return {
    generateCustomerEmail: (input, signal) => generateCustomerEmail(input, signal),
    extractCaseClaims: (input, signal) => extractCaseClaims(input, signal),
    draftDecision: (input, signal) => draftDecision(input, signal),
    critiqueDecision: (input, signal) => critiqueDecision(input, signal),
    rewriteResponseText: (input, signal) => rewriteResponseText(input, signal),
    streamGenerateCustomerEmail: (input, onPartial, signal) =>
      streamGenerateCustomerEmail(input, onPartial, signal),
    streamDraftDecision: (input, onPartial, signal) =>
      streamDraftDecision(input, onPartial, signal),
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
  RewriteTextInput,
};
