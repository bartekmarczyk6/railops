import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { createDemoCase } from "../domain/case-factory.ts";
import type { CaseTopic, DemoCasePackage, TruthMode } from "../domain/types.ts";
import type { RuleEvaluation, RuleOutcome } from "../rules/types.ts";
import { readState, resetState, updateState } from "../storage/store.ts";
import type { StoredCase, TraceEvent } from "../storage/types.ts";
import { runCase, type LlmClient } from "../pipeline/run-case.ts";
import type {
  Claim,
  CritiqueReport,
  DecisionDraft,
  DecisionOutcome,
  EmailDraft,
  ExtractedClaims,
} from "../llm/types.ts";

export const DEFAULT_FIXTURE_DIR = "fixtures";
export const LIVE_SMOKE_ENV = "RAILOPS_LIVE_SMOKE";
export const LIVE_SMOKE_FIXTURE_FILE = "delay-refund-supported.json";

export type EvalExpected = {
  outcome: RuleOutcome;
  amountIsSet?: boolean;
  minEvidenceRefs?: number;
  mustNotContain?: string[];
};

export type EvalFixture = {
  fixtureId: string;
  topic: CaseTopic;
  truthMode: TruthMode;
  seed: number;
  expected: EvalExpected;
};

export type EvalResult = {
  fixtureId: string;
  passed: boolean;
  failures: string[];
  trace: string[];
};

export type RunLocalEvalOptions = {
  fixtureDir?: string;
};

const CASE_TOPICS: ReadonlySet<string> = new Set<string>([
  "delay_refund",
  "cancelled_train_refund",
  "missed_connection",
  "ticket_change",
  "passenger_name_change",
  "missing_refund",
  "payment_without_ticket",
  "validation_discount_penalty",
]);

const TRUTH_MODES: ReadonlySet<string> = new Set<string>([
  "supported_by_records",
  "fabricated_delay",
  "fraud_attempt",
  "insufficient_information",
]);

const RULE_OUTCOMES: ReadonlySet<string> = new Set<string>([
  "eligible",
  "not_eligible",
  "follow_up_required",
  "escalate",
]);

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFixture(raw: string, file: string): EvalFixture {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`fixture ${file} is not valid JSON`);
  }
  if (!isStringRecord(parsed)) {
    throw new Error(`fixture ${file} must be a JSON object`);
  }
  const fixtureId = parsed.fixtureId;
  const topic = parsed.topic;
  const truthMode = parsed.truthMode;
  const seed = parsed.seed;
  const expected = parsed.expected;
  if (typeof fixtureId !== "string" || fixtureId.length === 0) {
    throw new Error(`fixture ${file} is missing fixtureId`);
  }
  if (typeof topic !== "string" || !CASE_TOPICS.has(topic)) {
    throw new Error(`fixture ${file} has unsupported topic`);
  }
  if (typeof truthMode !== "string" || !TRUTH_MODES.has(truthMode)) {
    throw new Error(`fixture ${file} has unsupported truthMode`);
  }
  if (typeof seed !== "number" || !Number.isInteger(seed)) {
    throw new Error(`fixture ${file} is missing an integer seed`);
  }
  if (!isStringRecord(expected)) {
    throw new Error(`fixture ${file} is missing expected object`);
  }
  const outcome = expected.outcome;
  if (typeof outcome !== "string" || !RULE_OUTCOMES.has(outcome)) {
    throw new Error(`fixture ${file} has unsupported expected.outcome`);
  }
  const result: EvalExpected = { outcome: outcome as RuleOutcome };
  if (expected.amountIsSet !== undefined) {
    if (typeof expected.amountIsSet !== "boolean") {
      throw new Error(`fixture ${file} expected.amountIsSet must be boolean`);
    }
    result.amountIsSet = expected.amountIsSet;
  }
  if (expected.minEvidenceRefs !== undefined) {
    if (typeof expected.minEvidenceRefs !== "number" || expected.minEvidenceRefs < 0) {
      throw new Error(`fixture ${file} expected.minEvidenceRefs must be a non-negative number`);
    }
    result.minEvidenceRefs = expected.minEvidenceRefs;
  }
  if (expected.mustNotContain !== undefined) {
    if (
      !Array.isArray(expected.mustNotContain) ||
      expected.mustNotContain.some((v) => typeof v !== "string")
    ) {
      throw new Error(`fixture ${file} expected.mustNotContain must be an array of strings`);
    }
    result.mustNotContain = expected.mustNotContain as string[];
  }
  return {
    fixtureId,
    topic: topic as CaseTopic,
    truthMode: truthMode as TruthMode,
    seed,
    expected: result,
  };
}

function requestedActionFor(topic: CaseTopic): string {
  switch (topic) {
    case "ticket_change":
      return "route_change";
    case "passenger_name_change":
      return "name_change";
    case "missed_connection":
      return "rebooking";
    case "validation_discount_penalty":
      return "discount_validation";
    default:
      return "refund";
  }
}

function mockClaimsForPkg(pkg: DemoCasePackage): ExtractedClaims {
  const exp = pkg.expected;
  const claims: Claim[] = [];
  if (exp.claimedDelayMinutes !== null) {
    claims.push({
      kind: "delay_minutes",
      description: `The journey was delayed by ${exp.claimedDelayMinutes} minutes`,
      value: exp.claimedDelayMinutes,
    });
  }
  if (exp.claimedPrice !== null) {
    claims.push({
      kind: "paid_price",
      description: `The passenger paid ${exp.claimedPrice} PLN`,
      value: exp.claimedPrice,
    });
  }
  const stations =
    exp.referencedStationPair !== null
      ? [exp.referencedStationPair.origin, exp.referencedStationPair.destination]
      : [];
  return {
    requestedAction: requestedActionFor(pkg.topic),
    claims,
    missingFields: [...exp.missingFields],
    referencedTicketNumbers: [...exp.referencedTicketNumbers],
    referencedStations: stations,
  };
}

function mockEmailForPkg(pkg: DemoCasePackage): EmailDraft {
  const exp = pkg.expected;
  const origin = exp.actualOrigin.length > 0 ? exp.actualOrigin : "my departure station";
  const destination = exp.actualDestination.length > 0 ? exp.actualDestination : "my destination";
  const delaySentence =
    exp.claimedDelayMinutes !== null
      ? ` The train was delayed by ${exp.claimedDelayMinutes} minutes.`
      : "";
  const ticketSentence =
    exp.referencedTicketNumbers.length > 0
      ? ` My ticket number is ${exp.referencedTicketNumbers[0]}.`
      : "";
  const firstTicket = pkg.tickets[0];
  const mentionedFacts =
    firstTicket !== undefined
      ? [`record:ticket:${firstTicket.id}`]
      : [`record:route:${pkg.route.id}`];
  return {
    subject: `Request about ${pkg.topic.replace(/_/g, " ")}`,
    body: `Hello, I travelled from ${origin} to ${destination}.${delaySentence}${ticketSentence} Please review my request. Thank you.`,
    mentionedFacts,
  };
}

type RulesPayload = Pick<RuleEvaluation, "outcome" | "amount" | "reasons" | "evidenceRefs">;

function parseRulesJson(rulesJson: string): RulesPayload | null {
  const firstLine = rulesJson.split("\n")[0] ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(firstLine);
  } catch {
    return null;
  }
  if (!isStringRecord(parsed)) return null;
  if (typeof parsed.outcome !== "string" || !RULE_OUTCOMES.has(parsed.outcome)) return null;
  const amount = typeof parsed.amount === "number" ? parsed.amount : null;
  const reasons = Array.isArray(parsed.reasons)
    ? (parsed.reasons as unknown[])
        .filter(isStringRecord)
        .map((r) => ({
          code: typeof r.code === "string" ? r.code : "unknown",
          description: typeof r.description === "string" ? r.description : "",
          policyVersion: "1.0.0" as const,
        }))
    : [];
  const evidenceRefs = Array.isArray(parsed.evidenceRefs)
    ? (parsed.evidenceRefs as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  return {
    outcome: parsed.outcome as RuleOutcome,
    amount,
    reasons,
    evidenceRefs,
  };
}

function draftOutcomeForRule(topic: CaseTopic, outcome: RuleOutcome): DecisionOutcome {
  if (outcome === "eligible") {
    switch (topic) {
      case "delay_refund":
      case "cancelled_train_refund":
      case "missing_refund":
        return "refund";
      case "missed_connection":
      case "ticket_change":
      case "passenger_name_change":
        return "change";
      default:
        return "follow_up";
    }
  }
  if (outcome === "not_eligible" || outcome === "escalate") {
    return "unsupported_or_escalate";
  }
  return "follow_up";
}

function draftResponseFor(outcome: RuleOutcome, amount: number | null): string {
  if (outcome === "eligible") {
    return amount !== null && amount > 0
      ? `Based on the records reviewed, your request is supported and an amount of ${amount.toFixed(2)} PLN applies.`
      : "Based on the records reviewed, your request is supported.";
  }
  if (outcome === "not_eligible") {
    return "The claim is not supported by the available records.";
  }
  if (outcome === "escalate") {
    return "The claim is not supported by the available records and will be passed to a specialist.";
  }
  return "Additional information is required before this request can be decided.";
}

function buildMockDraft(pkg: DemoCasePackage, rules: RulesPayload | null): DecisionDraft {
  const outcome: RuleOutcome = rules?.outcome ?? "follow_up_required";
  const amount = rules?.amount ?? null;
  const evidenceRefs =
    rules !== null && rules.evidenceRefs.length > 0
      ? [...rules.evidenceRefs]
      : [`record:route:${pkg.route.id}`];
  const firstRef = evidenceRefs[0] ?? `record:route:${pkg.route.id}`;
  const decisionBasis = (rules?.reasons ?? []).map((r) => ({
    claim: r.code,
    evidenceRef: firstRef,
    note: r.description,
  }));
  if (decisionBasis.length === 0) {
    decisionBasis.push({
      claim: "case_review",
      evidenceRef: firstRef,
      note: "Reviewed against the available records.",
    });
  }
  return {
    outcome: draftOutcomeForRule(pkg.topic, outcome),
    proposedAmount: amount,
    decisionBasis,
    response: draftResponseFor(outcome, amount),
    evidenceRefs,
  };
}

export type MockLlmHandle = {
  client: LlmClient;
  email: EmailDraft;
  claims: ExtractedClaims;
  drafts: DecisionDraft[];
};

export function buildMockLlmForPkg(pkg: DemoCasePackage): MockLlmHandle {
  const email = mockEmailForPkg(pkg);
  const claims = mockClaimsForPkg(pkg);
  const drafts: DecisionDraft[] = [];
  const client: LlmClient = {
    generateCustomerEmail: async () => email,
    extractCaseClaims: async () => claims,
    draftDecision: async (input) => {
      const draft = buildMockDraft(pkg, parseRulesJson(input.rulesJson));
      drafts.push(draft);
      return draft;
    },
    critiqueDecision: async (): Promise<CritiqueReport> => ({
      passed: true,
      findings: [],
      correctedDraft: null,
    }),
  };
  return { client, email, claims, drafts };
}

function asRuleEvaluation(payload: unknown): RuleEvaluation | null {
  if (!isStringRecord(payload)) return null;
  if (typeof payload.outcome !== "string" || !RULE_OUTCOMES.has(payload.outcome)) return null;
  if (!Array.isArray(payload.evidenceRefs) || !Array.isArray(payload.reasons)) return null;
  return payload as unknown as RuleEvaluation;
}

async function seedStoredCase(pkg: DemoCasePackage, dataDir: string): Promise<StoredCase> {
  const now = new Date().toISOString();
  const stored: StoredCase = {
    caseId: pkg.id,
    topic: pkg.topic,
    truthMode: pkg.truthMode,
    state: "created",
    createdAt: now,
    updatedAt: now,
    seed: pkg.seed,
    pkg,
    trace: [],
    reviewHistory: [],
    learningRef: null,
    version: 1,
  };
  await updateState((s) => ({ ...s, cases: [...s.cases, stored] }), { dataDir });
  return stored;
}

function removeDir(dataDir: string): void {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    return;
  }
}

async function evaluateFixture(
  fixture: EvalFixture,
  dataDir: string,
  indexPath: string,
): Promise<EvalResult> {
  const failures: string[] = [];
  const trace: string[] = [];
  try {
    const pkg = createDemoCase({
      topic: fixture.topic,
      truthMode: fixture.truthMode,
      seed: fixture.seed,
    });
    await seedStoredCase(pkg, dataDir);
    const mock = buildMockLlmForPkg(pkg);
    const events: TraceEvent[] = [];
    for await (const ev of runCase(pkg.id, {
      dataDir,
      runId: `eval-${fixture.fixtureId}`,
      indexPath,
      llm: mock.client,
      memoryClient: null,
    })) {
      events.push(ev);
      trace.push(`${ev.stage}:${ev.status} ${ev.summary}`);
    }
    for (const ev of events) {
      if (ev.status === "failed") {
        failures.push(`stage ${ev.stage} failed: ${ev.error ?? ev.summary}`);
      }
    }
    const rulesEvent = events.find(
      (e) => e.stage === "evaluating_rules" && e.status === "completed",
    );
    const rules = rulesEvent !== undefined ? asRuleEvaluation(rulesEvent.payload) : null;
    if (rules === null) {
      failures.push("no completed evaluating_rules event found");
    } else {
      if (rules.outcome !== fixture.expected.outcome) {
        failures.push(`expected outcome ${fixture.expected.outcome}, got ${rules.outcome}`);
      }
      if (fixture.expected.amountIsSet === true && rules.amount === null) {
        failures.push("expected a computed amount, got null");
      }
      if (
        fixture.expected.minEvidenceRefs !== undefined &&
        rules.evidenceRefs.length < fixture.expected.minEvidenceRefs
      ) {
        failures.push(
          `expected at least ${fixture.expected.minEvidenceRefs} evidence refs, got ${rules.evidenceRefs.length}`,
        );
      }
    }
    const banned = fixture.expected.mustNotContain ?? [];
    if (banned.length > 0) {
      const finalDraft = mock.drafts[mock.drafts.length - 1] ?? null;
      const haystacks: string[] = [mock.email.subject, mock.email.body];
      if (finalDraft !== null) haystacks.push(finalDraft.response);
      if (rules !== null) {
        for (const r of rules.reasons) haystacks.push(r.description);
      }
      for (const term of banned) {
        const lower = term.toLowerCase();
        if (haystacks.some((h) => h.toLowerCase().includes(lower))) {
          failures.push(`forbidden term "${term}" appeared in pipeline output text`);
        }
      }
    }
    const state = await readState({ dataDir });
    const storedCase = state.cases.find((c) => c.caseId === pkg.id);
    const expectedState = fixture.expected.outcome === "escalate" ? "escalated" : "reviewable";
    if (storedCase?.state !== expectedState) {
      failures.push(`expected case state ${expectedState}, got ${storedCase?.state ?? "missing"}`);
    }
  } catch (err) {
    failures.push(err instanceof Error ? err.message : String(err));
  }
  return { fixtureId: fixture.fixtureId, passed: failures.length === 0, failures, trace };
}

export async function runLocalEval(options?: RunLocalEvalOptions): Promise<EvalResult[]> {
  const fixtureDir = resolve(options?.fixtureDir ?? DEFAULT_FIXTURE_DIR);
  const files = readdirSync(fixtureDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const dataDir = mkdtempSync(join(tmpdir(), "railops-evals-"));
  const indexPath = resolve("knowledge/index.json");
  const results: EvalResult[] = [];
  try {
    for (const file of files) {
      let fixture: EvalFixture;
      try {
        fixture = parseFixture(readFileSync(join(fixtureDir, file), "utf8"), file);
      } catch (err) {
        results.push({
          fixtureId: file,
          passed: false,
          failures: [err instanceof Error ? err.message : String(err)],
          trace: [],
        });
        continue;
      }
      results.push(await evaluateFixture(fixture, dataDir, indexPath));
    }
  } finally {
    resetState();
    removeDir(dataDir);
  }
  return results;
}

export function liveSmokeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[LIVE_SMOKE_ENV] === "1";
}

export async function runLiveSmokeTest(options?: RunLocalEvalOptions): Promise<EvalResult> {
  const fixtureId = "live-smoke";
  if (!liveSmokeEnabled()) {
    return {
      fixtureId,
      passed: true,
      failures: [],
      trace: ["skipped: set RAILOPS_LIVE_SMOKE=1 to run the live Groq smoke test"],
    };
  }
  const failures: string[] = [];
  const trace: string[] = [];
  const fixtureDir = resolve(options?.fixtureDir ?? DEFAULT_FIXTURE_DIR);
  const dataDir = mkdtempSync(join(tmpdir(), "railops-live-smoke-"));
  const indexPath = resolve("knowledge/index.json");
  try {
    const fixture = parseFixture(
      readFileSync(join(fixtureDir, LIVE_SMOKE_FIXTURE_FILE), "utf8"),
      LIVE_SMOKE_FIXTURE_FILE,
    );
    const pkg = createDemoCase({
      topic: fixture.topic,
      truthMode: fixture.truthMode,
      seed: fixture.seed,
    });
    await seedStoredCase(pkg, dataDir);
    const events: TraceEvent[] = [];
    for await (const ev of runCase(pkg.id, {
      dataDir,
      runId: "live-smoke",
      indexPath,
      memoryClient: null,
    })) {
      events.push(ev);
      trace.push(`${ev.stage}:${ev.status} ${ev.summary}`);
    }
    for (const ev of events) {
      if (ev.status === "failed") {
        failures.push(`stage ${ev.stage} failed: ${ev.error ?? ev.summary}`);
      }
    }
    const stages = new Set(events.map((e) => e.stage));
    for (const required of ["generating_email", "extracting_claims", "evaluating_rules"] as const) {
      if (!stages.has(required)) {
        failures.push(`missing stage ${required}`);
      }
    }
    const state = await readState({ dataDir });
    const finalState = state.cases.find((c) => c.caseId === pkg.id)?.state;
    if (finalState !== "reviewable" && finalState !== "escalated") {
      failures.push(`unexpected final state ${finalState ?? "missing"}`);
    }
  } catch (err) {
    failures.push(err instanceof Error ? err.message : String(err));
  } finally {
    resetState();
    removeDir(dataDir);
  }
  return { fixtureId, passed: failures.length === 0, failures, trace };
}
