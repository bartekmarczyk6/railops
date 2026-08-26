import test from "node:test";
import assert from "node:assert/strict";
import { resetBamlEnvVars } from "../baml_client/globals";
import {
  generateCustomerEmail,
  extractCaseClaims,
  draftDecision,
  critiqueDecision,
  setBamlClientForTesting,
  resetBamlClientForTesting,
  LlmError,
  type RawBamlCaller,
} from "../lib/llm/baml";

function makeRawCaller(overrides: Partial<RawBamlCaller> = {}): RawBamlCaller {
  const emailDraft = {
    subject: "Re: delay refund",
    body: "Hello,",
    mentionedFacts: ["record:ticket:TKT-000001"],
  };
  const claims = {
    requestedAction: "refund",
    claims: [],
    missingFields: [],
    referencedTicketNumbers: ["TKT-000001"],
    referencedStations: ["Warszawa Centralna", "Krakow Glowny"],
  };
  const decision = {
    outcome: "Refund",
    proposedAmount: 100,
    decisionBasis: [
      { claim: "delay", evidenceRef: "rule:v1:delay-30", note: "delay exceeds 30 minutes" },
    ],
    response: "Refund approved",
    evidenceRefs: ["rule:v1:delay-30", "record:ticket:TKT-000001"],
  };
  const critique = {
    passed: true,
    findings: [],
    correctedDraft: null,
  };
  return {
    GenerateCustomerEmail: overrides.GenerateCustomerEmail ?? (async () => emailDraft),
    ExtractCaseClaims: overrides.ExtractCaseClaims ?? (async () => claims),
    DraftDecision: overrides.DraftDecision ?? (async () => decision),
    CritiqueDecision: overrides.CritiqueDecision ?? (async () => critique),
  };
}

test.beforeEach(() => {
  resetBamlClientForTesting();
});

test.afterEach(() => {
  resetBamlClientForTesting();
});

test("baml: generateCustomerEmail returns typed draft through raw mock caller", async () => {
  setBamlClientForTesting(makeRawCaller());
  const draft = await generateCustomerEmail("case json", new AbortController().signal);
  assert.equal(draft.subject, "Re: delay refund");
  assert.equal(typeof draft.body, "string");
  assert.ok(Array.isArray(draft.mentionedFacts));
  assert.equal(draft.mentionedFacts.length, 1);
});

test("baml: extractCaseClaims returns typed claims through raw mock caller", async () => {
  setBamlClientForTesting(makeRawCaller());
  const claims = await extractCaseClaims("case json", new AbortController().signal);
  assert.equal(claims.requestedAction, "refund");
  assert.ok(Array.isArray(claims.claims));
  assert.ok(Array.isArray(claims.missingFields));
  assert.equal(claims.referencedTicketNumbers.length, 1);
  assert.equal(claims.referencedStations.length, 2);
});

test("baml: draftDecision returns typed decision through raw mock caller", async () => {
  setBamlClientForTesting(makeRawCaller());
  const decision = await draftDecision("case json", new AbortController().signal);
  assert.equal(decision.outcome, "refund");
  assert.equal(decision.proposedAmount, 100);
  assert.equal(decision.decisionBasis.length, 1);
  assert.equal(decision.evidenceRefs.length, 2);
});

test("baml: critiqueDecision returns typed critique through raw mock caller", async () => {
  setBamlClientForTesting(makeRawCaller());
  const report = await critiqueDecision("case json", new AbortController().signal);
  assert.equal(report.passed, true);
  assert.ok(Array.isArray(report.findings));
  assert.equal(report.correctedDraft, null);
});

test("baml: empty evidenceRefs is surfaced as LlmError", async () => {
  setBamlClientForTesting(
    makeRawCaller({
      DraftDecision: async () => ({
        outcome: "Refund",
        proposedAmount: 50,
        decisionBasis: [
          { claim: "delay", evidenceRef: "rule:v1:delay-30", note: "ok" },
        ],
        response: "ok",
        evidenceRefs: [],
      }),
    }),
  );
  await assert.rejects(
    () => draftDecision("case json", new AbortController().signal),
    (err: unknown) => err instanceof LlmError && err.code === "missing_evidence_refs",
  );
});

test("baml: unsupported outcome value is rejected as LlmError", async () => {
  setBamlClientForTesting(
    makeRawCaller({
      DraftDecision: async () => ({
        outcome: "BogusOutcome",
        proposedAmount: 0,
        decisionBasis: [
          { claim: "x", evidenceRef: "rule:v1:r", note: "n" },
        ],
        response: "x",
        evidenceRefs: ["rule:v1:r"],
      }),
    }),
  );
  await assert.rejects(
    () => draftDecision("case json", new AbortController().signal),
    (err: unknown) => err instanceof LlmError && err.code === "invalid_outcome",
  );
});

test("baml: amount mismatch is flagged by critic mock as not passed", async () => {
  setBamlClientForTesting(
    makeRawCaller({
      CritiqueDecision: async () => ({
        passed: false,
        findings: [
          {
            severity: "Error",
            message: "proposedAmount 50 does not match rule result 100",
            evidenceRef: "rule:v1:delay-30",
          },
        ],
        correctedDraft: null,
      }),
    }),
  );
  const report = await critiqueDecision("case json", new AbortController().signal);
  assert.equal(report.passed, false);
  assert.equal(report.findings[0]?.severity, "error");
  assert.match(report.findings[0]?.message ?? "", /proposedAmount/);
});

test("baml: extractCaseClaims surfaces missing required fields via LlmError", async () => {
  setBamlClientForTesting(
    makeRawCaller({
      ExtractCaseClaims: async () => ({
        requestedAction: "",
        claims: [],
        missingFields: [],
        referencedTicketNumbers: [],
        referencedStations: [],
      }),
    }),
  );
  await assert.rejects(
    () => extractCaseClaims("case json", new AbortController().signal),
    (err: unknown) => err instanceof LlmError && err.code === "missing_required_field",
  );
});

test("baml: AbortSignal is honored before the raw caller is invoked", async () => {
  let called = false;
  setBamlClientForTesting(
    makeRawCaller({
      GenerateCustomerEmail: async () => {
        called = true;
        return { subject: "x", body: "y", mentionedFacts: ["f"] };
      },
    }),
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => generateCustomerEmail("case json", controller.signal),
    (err: unknown) => err instanceof LlmError && err.code === "aborted",
  );
  assert.equal(called, false);
});

test("baml: all four functions pass through the raw caller end-to-end", async () => {
  setBamlClientForTesting(makeRawCaller());
  const signal = new AbortController().signal;
  const email = await generateCustomerEmail("{}", signal);
  const claims = await extractCaseClaims("{}", signal);
  const decision = await draftDecision("{}", signal);
  const report = await critiqueDecision("{}", signal);
  assert.equal(email.mentionedFacts.length, 1);
  assert.equal(claims.referencedTicketNumbers[0], "TKT-000001");
  assert.equal(decision.evidenceRefs.length, 2);
  assert.equal(report.passed, true);
});

test("baml: generateCustomerEmail with bad shape is rejected as LlmError", async () => {
  setBamlClientForTesting(
    makeRawCaller({
      GenerateCustomerEmail: async () => ({
        subject: 42,
        body: "x",
        mentionedFacts: ["f"],
      }) as unknown as { subject: string; body: string; mentionedFacts: string[] },
    }),
  );
  await assert.rejects(
    () => generateCustomerEmail("case json", new AbortController().signal),
    (err: unknown) => err instanceof LlmError && err.code === "invalid_shape",
  );
});

test("baml: validation-style error from caller is mapped to LlmError", async () => {
  setBamlClientForTesting(
    makeRawCaller({
      DraftDecision: async () => {
        throw new Error("schema mismatch: outcome must be one of allowed");
      },
    }),
  );
  await assert.rejects(
    () => draftDecision("case json", new AbortController().signal),
    (err: unknown) => err instanceof LlmError,
  );
});

test("baml: resetBamlEnvVars is callable without throwing", () => {
  assert.doesNotThrow(() => resetBamlEnvVars({ GROQ_API_KEY: "x" }));
});
