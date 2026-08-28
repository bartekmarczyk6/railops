import test from "node:test";
import assert from "node:assert/strict";

import {
  getLlmClient,
  resetLlmClientForTesting,
} from "../lib/pipeline/llm-resolver.ts";

test("real LlmClient implements the full LlmClient surface, including follow-up methods", () => {
  delete process.env.RAILOPS_FAKE_LLM;
  resetLlmClientForTesting();
  const llm = getLlmClient() as unknown as Record<string, unknown>;
  const methods = [
    "generateCustomerEmail",
    "extractCaseClaims",
    "draftDecision",
    "critiqueDecision",
    "rewriteResponseText",
    "interpretFollowUp",
    "draftFollowUp",
    "streamGenerateCustomerEmail",
    "streamDraftDecision",
  ];
  for (const method of methods) {
    assert.equal(typeof llm[method], "function", `real LlmClient is missing ${method}`);
  }
  resetLlmClientForTesting();
});
