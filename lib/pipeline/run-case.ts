import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import { readState, updateState } from "../storage/store.ts";
import type {
  AppState,
  CaseState,
  StoredCase,
  TraceEvent,
} from "../storage/types.ts";
import { evaluateCase } from "../rules/evaluate.ts";
import type { ExtractedClaims as RulesExtractedClaims, RuleEvaluation } from "../rules/types.ts";
import { searchKnowledge } from "../knowledge/search.ts";
import type { KnowledgeExcerpt } from "../knowledge/types.ts";
import { recallReviewerContext } from "../memory/hindsight.ts";
import type { MemoryContext } from "../memory/types.ts";
import {
  generateCustomerEmail,
  extractCaseClaims,
  draftDecision,
  critiqueDecision,
  type GenerateEmailInput,
  type ExtractClaimsInput,
  type DraftDecisionInput,
  type CritiqueDecisionInput,
} from "../llm/baml.ts";
import type {
  EmailDraft,
  ExtractedClaims,
  DecisionDraft,
  CritiqueReport,
} from "../llm/types.ts";

import { createEvent, sameRunEvents } from "./events.ts";

export const DEFAULT_DATA_DIR = ".railops/data";
export const DEFAULT_KNOWLEDGE_INDEX = "./knowledge/index.json";
export const MAX_BAML_CALLS_PER_RUN = 6;
export const MAX_REVISIONS = 1;

export class PipelineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
  }
}

export class MaxRevisionsReached extends Error {
  constructor() {
    super("Maximum revisions reached");
    this.name = "MaxRevisionsReached";
  }
}

export class ReviewError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
  }
}

export type LlmClient = {
  generateCustomerEmail(
    input: GenerateEmailInput,
    signal?: AbortSignal,
  ): Promise<EmailDraft>;
  extractCaseClaims(
    input: ExtractClaimsInput,
    signal?: AbortSignal,
  ): Promise<ExtractedClaims>;
  draftDecision(
    input: DraftDecisionInput,
    signal?: AbortSignal,
  ): Promise<DecisionDraft>;
  critiqueDecision(
    input: CritiqueDecisionInput,
    signal?: AbortSignal,
  ): Promise<CritiqueReport>;
};

const defaultLlm: LlmClient = {
  generateCustomerEmail: (input, signal) => generateCustomerEmail(input, signal),
  extractCaseClaims: (input, signal) => extractCaseClaims(input, signal),
  draftDecision: (input, signal) => draftDecision(input, signal),
  critiqueDecision: (input, signal) => critiqueDecision(input, signal),
};

export type RunCaseOptions = {
  signal?: AbortSignal;
  runId?: string;
  dataDir?: string;
  indexPath?: string;
  llm?: LlmClient;
  memoryClient?: Parameters<typeof recallReviewerContext>[0]["client"];
};

type RunContext = {
  caseId: string;
  runId: string;
  signal: AbortSignal | undefined;
  dataDir: string;
  indexPath: string;
  llm: LlmClient;
  memoryClient: RunCaseOptions["memoryClient"];
  events: TraceEvent[];
  nextSeq: number;
  casePkg: StoredCase["pkg"];
  bamlCalls: number;
  emailDraft: EmailDraft | null;
  claims: ExtractedClaims | null;
  rules: RuleEvaluation | null;
  knowledge: KnowledgeExcerpt[];
  recordRefs: string[];
  decisionDraft: DecisionDraft | null;
  reviseCount: number;
};

function ensureRunId(runId?: string): string {
  return runId && runId.length > 0 ? runId : `run-${randomUUID()}`;
}

function checkAbort(signal: AbortSignal | undefined): boolean {
  return Boolean(signal && signal.aborted);
}

async function persist(
  ctx: RunContext,
  mutator: (state: AppState) => AppState,
): Promise<AppState> {
  return updateState(mutator, { dataDir: ctx.dataDir });
}

function recordRefsForPkg(pkg: StoredCase["pkg"]): string[] {
  const refs: string[] = [];
  for (const t of pkg.tickets) refs.push(`record:ticket:${t.id}`);
  for (const p of pkg.payments) refs.push(`record:payment:${p.id}`);
  refs.push(`record:route:${pkg.route.id}`);
  return refs;
}

function knowledgeEvidenceRefs(excerpts: readonly KnowledgeExcerpt[]): string[] {
  return excerpts.map((e) => `knowledge:${e.sourceId}:${e.heading}`);
}

function mergeUniqueStrings(a: readonly string[], b: readonly string[]): string[] {
  const set = new Set<string>();
  for (const v of a) set.add(v);
  for (const v of b) set.add(v);
  return [...set];
}

function claimsForRules(claims: ExtractedClaims): RulesExtractedClaims {
  return {
    requestedAction: claims.requestedAction,
    claims: claims.claims.map((c) => ({
      field: c.kind,
      value: c.value !== null && c.value !== undefined ? String(c.value) : c.description,
    })),
    missingFields: claims.missingFields,
    referencedTicketNumbers: claims.referencedTicketNumbers,
    referencedStations: claims.referencedStations,
  };
}

async function record(
  ctx: RunContext,
  stage: TraceEvent["stage"],
  status: TraceEvent["status"],
  summary: string,
  extras: Partial<{
    functionName: string | null;
    recordRefs: string[];
    evidenceRefs: string[];
    payload: unknown;
    durationMs: number | null;
    error: string | null;
  }> = {},
): Promise<TraceEvent> {
  const event = createEvent({
    caseId: ctx.caseId,
    runId: ctx.runId,
    sequence: ctx.nextSeq,
    stage,
    status,
    summary,
    functionName: extras.functionName ?? null,
    recordRefs: extras.recordRefs ?? [],
    evidenceRefs: extras.evidenceRefs ?? [],
    payload: extras.payload,
    durationMs: extras.durationMs ?? null,
    error: extras.error ?? null,
  });
  ctx.events.push(event);
  ctx.nextSeq = ctx.nextSeq + 1;
  await persist(ctx, (state) => {
    const events = state.events.filter(
      (e) => !(e.caseId === ctx.caseId && e.runId === ctx.runId && e.id === event.id),
    );
    return { ...state, events: [...events, event] };
  });
  return event;
}

async function finalizeCase(
  ctx: RunContext,
  newState: CaseState,
  version: number,
): Promise<void> {
  await persist(ctx, (state) => {
    const cases = state.cases.map((c) =>
      c.caseId === ctx.caseId
        ? { ...c, state: newState, updatedAt: new Date().toISOString(), version }
        : c,
    );
    return { ...state, cases };
  });
}

async function generateEmail(
  ctx: RunContext,
): Promise<{ ok: boolean; events: TraceEvent[] }> {
  if (checkAbort(ctx.signal)) {
    const ev = await record(ctx, "generating_email", "failed", "Run aborted", { error: "aborted" });
    return { ok: false, events: [ev] };
  }
  const startedAt = Date.now();
  const started = await record(ctx, "generating_email", "started", "Generate customer email for case", {
    functionName: "GenerateCustomerEmail",
    recordRefs: ctx.recordRefs,
  });
  try {
    const pkg = ctx.casePkg;
    const input: GenerateEmailInput = {
      casePackageJson: JSON.stringify(pkg),
      topic: pkg.topic,
      truthMode: pkg.truthMode,
      claimsJson: JSON.stringify(ctx.claims ?? {}),
      rulesJson: JSON.stringify(ctx.rules ?? {}),
      knowledgeJson: JSON.stringify(ctx.knowledge),
      memoryJson: JSON.stringify({ source: "none", reviewerGuidance: [] }),
    };
    const email = await ctx.llm.generateCustomerEmail(input, ctx.signal);
    ctx.bamlCalls += 1;
    ctx.emailDraft = email;
    const dur = Date.now() - startedAt;
    const completed = await record(
      ctx,
      "generating_email",
      "completed",
      `Email draft generated: ${email.subject}`,
      {
        functionName: "GenerateCustomerEmail",
        recordRefs: ctx.recordRefs,
        payload: { subject: email.subject, mentionedFacts: email.mentionedFacts },
        durationMs: dur,
      },
    );
    return { ok: true, events: [started, completed] };
  } catch (err) {
    const dur = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const failed = await record(ctx, "generating_email", "failed", `Email generation failed: ${message}`, {
      functionName: "GenerateCustomerEmail",
      error: message,
      durationMs: dur,
    });
    return { ok: false, events: [started, failed] };
  }
}

async function extractClaims(
  ctx: RunContext,
): Promise<{ ok: boolean; events: TraceEvent[] }> {
  if (checkAbort(ctx.signal)) {
    const ev = await record(ctx, "extracting_claims", "failed", "Run aborted", { error: "aborted" });
    return { ok: false, events: [ev] };
  }
  const startedAt = Date.now();
  const started = await record(ctx, "extracting_claims", "started", "Extract claims from email body", {
    functionName: "ExtractCaseClaims",
  });
  try {
    const body = ctx.emailDraft?.body ?? "";
    const input: ExtractClaimsInput = {
      casePackageJson: JSON.stringify(ctx.casePkg),
      topic: ctx.casePkg.topic,
      truthMode: ctx.casePkg.truthMode,
      messageText: body,
    };
    const claims = await ctx.llm.extractCaseClaims(input, ctx.signal);
    ctx.bamlCalls += 1;
    ctx.claims = claims;
    const dur = Date.now() - startedAt;
    const completed = await record(
      ctx,
      "extracting_claims",
      "completed",
      `Extracted ${claims.claims.length} claims; ${claims.missingFields.length} missing`,
      {
        functionName: "ExtractCaseClaims",
        payload: claims,
        durationMs: dur,
      },
    );
    return { ok: true, events: [started, completed] };
  } catch (err) {
    const dur = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const failed = await record(ctx, "extracting_claims", "failed", `Claim extraction failed: ${message}`, {
      functionName: "ExtractCaseClaims",
      error: message,
      durationMs: dur,
    });
    return { ok: false, events: [started, failed] };
  }
}

async function retrieveAndCheck(
  ctx: RunContext,
): Promise<{ ok: boolean; events: TraceEvent[] }> {
  const events: TraceEvent[] = [];
  if (checkAbort(ctx.signal)) {
    const ev = await record(ctx, "retrieving_knowledge", "failed", "Run aborted", { error: "aborted" });
    events.push(ev);
    const ev2 = await record(ctx, "checking_records", "failed", "Run aborted", { error: "aborted" });
    events.push(ev2);
    return { ok: false, events };
  }
  const rkStart = await record(
    ctx,
    "retrieving_knowledge",
    "started",
    "Search knowledge base for relevant passages",
    { functionName: "searchKnowledge" },
  );
  events.push(rkStart);
  const crStart = await record(
    ctx,
    "checking_records",
    "started",
    "Inspect synthetic records for evidence references",
    { functionName: "collectRecordRefs" },
  );
  events.push(crStart);
  try {
    const kStart = Date.now();
    const terms = [
      ctx.casePkg.topic,
      ctx.casePkg.truthMode,
      ctx.emailDraft?.subject ?? "",
      ...(ctx.claims?.claims.map((c) => c.kind) ?? []),
    ].filter((t) => t.length > 0);
    const [knowledge, recordRefs] = await Promise.all([
      Promise.resolve().then(() => {
        if (checkAbort(ctx.signal)) {
          throw new PipelineError("aborted", "aborted before knowledge search");
        }
        return searchKnowledge(
          { topic: ctx.casePkg.topic, terms, limit: 5 },
          ctx.indexPath,
        );
      }),
      Promise.resolve().then(() => {
        if (checkAbort(ctx.signal)) {
          throw new PipelineError("aborted", "aborted before record check");
        }
        return recordRefsForPkg(ctx.casePkg);
      }),
    ]);
    ctx.knowledge = knowledge;
    ctx.recordRefs = mergeUniqueStrings(ctx.recordRefs, recordRefs);
    const knowledgeRefs = knowledgeEvidenceRefs(knowledge);
    const dur = Date.now() - kStart;
    const rkDone = await record(
      ctx,
      "retrieving_knowledge",
      "completed",
      `Retrieved ${knowledge.length} knowledge excerpts`,
      {
        functionName: "searchKnowledge",
        evidenceRefs: knowledgeRefs,
        payload: { count: knowledge.length, ids: knowledge.map((k) => k.id) },
        durationMs: dur,
      },
    );
    events.push(rkDone);
    const crDone = await record(
      ctx,
      "checking_records",
      "completed",
      `Captured ${recordRefs.length} record references`,
      {
        functionName: "collectRecordRefs",
        recordRefs,
        durationMs: dur,
      },
    );
    events.push(crDone);
    return { ok: true, events };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const rkFail = await record(
      ctx,
      "retrieving_knowledge",
      "failed",
      `Knowledge retrieval failed: ${message}`,
      { functionName: "searchKnowledge", error: message },
    );
    events.push(rkFail);
    const crFail = await record(
      ctx,
      "checking_records",
      "failed",
      `Record check failed: ${message}`,
      { functionName: "collectRecordRefs", error: message },
    );
    events.push(crFail);
    return { ok: false, events };
  }
}

async function evaluateRules(
  ctx: RunContext,
): Promise<{ ok: boolean; events: TraceEvent[] }> {
  if (checkAbort(ctx.signal)) {
    const ev = await record(ctx, "evaluating_rules", "failed", "Run aborted", { error: "aborted" });
    return { ok: false, events: [ev] };
  }
  if (!ctx.claims) {
    const ev = await record(ctx, "evaluating_rules", "failed", "Missing claims for rule evaluation", {
      error: "no_claims",
    });
    return { ok: false, events: [ev] };
  }
  const startedAt = Date.now();
  const started = await record(ctx, "evaluating_rules", "started", "Compute deterministic rule evaluation", {
    functionName: "evaluateCase",
  });
  try {
    const rules = evaluateCase({ pkg: ctx.casePkg, claims: claimsForRules(ctx.claims) });
    ctx.rules = rules;
    const dur = Date.now() - startedAt;
    const completed = await record(
      ctx,
      "evaluating_rules",
      "completed",
      `Rule outcome: ${rules.outcome}${rules.amount !== null ? ` amount=${rules.amount}` : ""}`,
      {
        functionName: "evaluateCase",
        evidenceRefs: rules.evidenceRefs,
        payload: rules,
        durationMs: dur,
      },
    );
    return { ok: true, events: [started, completed] };
  } catch (err) {
    const dur = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const failed = await record(ctx, "evaluating_rules", "failed", `Rule evaluation failed: ${message}`, {
      functionName: "evaluateCase",
      error: message,
      durationMs: dur,
    });
    return { ok: false, events: [started, failed] };
  }
}

async function draftDecisionStage(
  ctx: RunContext,
  memoryContext: MemoryContext,
  isRevision: boolean,
  criticFindings: ReadonlyArray<{ severity: string; message: string; evidenceRef: string | null }>,
): Promise<{ ok: boolean; events: TraceEvent[] }> {
  if (checkAbort(ctx.signal)) {
    const ev = await record(ctx, "drafting", "failed", "Run aborted", { error: "aborted" });
    return { ok: false, events: [ev] };
  }
  const startedAt = Date.now();
  const started = await record(
    ctx,
    "drafting",
    "started",
    isRevision
      ? "Revise decision draft using critic findings"
      : "Draft initial decision",
    { functionName: "DraftDecision" },
  );
  try {
    const baseInput: DraftDecisionInput = {
      casePackageJson: JSON.stringify(ctx.casePkg),
      topic: ctx.casePkg.topic,
      truthMode: ctx.casePkg.truthMode,
      claimsJson: JSON.stringify(ctx.claims),
      rulesJson: JSON.stringify(ctx.rules),
      knowledgeJson: JSON.stringify(ctx.knowledge),
      memoryJson: JSON.stringify(memoryContext),
    };
    let draft: DecisionDraft;
    if (isRevision && criticFindings.length > 0) {
      const findingsJson = JSON.stringify(criticFindings);
      const revised: DraftDecisionInput = {
        ...baseInput,
        rulesJson: `${baseInput.rulesJson}\n## Critic findings\n${findingsJson}`,
      };
      draft = await ctx.llm.draftDecision(revised, ctx.signal);
      ctx.bamlCalls += 1;
      ctx.reviseCount += 1;
    } else {
      draft = await ctx.llm.draftDecision(baseInput, ctx.signal);
      ctx.bamlCalls += 1;
    }
    ctx.decisionDraft = draft;
    const dur = Date.now() - startedAt;
    const completed = await record(
      ctx,
      "drafting",
      "completed",
      `Drafted decision: outcome=${ctx.decisionDraft?.outcome} amount=${ctx.decisionDraft?.proposedAmount ?? "null"}`,
      {
        functionName: "DraftDecision",
        evidenceRefs: ctx.decisionDraft?.evidenceRefs ?? [],
        payload: ctx.decisionDraft,
        durationMs: dur,
      },
    );
    return { ok: true, events: [started, completed] };
  } catch (err) {
    const dur = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const failed = await record(ctx, "drafting", "failed", `Decision draft failed: ${message}`, {
      functionName: "DraftDecision",
      error: message,
      durationMs: dur,
    });
    return { ok: false, events: [started, failed] };
  }
}

async function critiqueStage(
  ctx: RunContext,
): Promise<{ ok: boolean; events: TraceEvent[]; report: CritiqueReport | null }> {
  if (checkAbort(ctx.signal)) {
    const ev = await record(ctx, "critiquing", "failed", "Run aborted", { error: "aborted" });
    return { ok: false, events: [ev], report: null };
  }
  if (!ctx.decisionDraft) {
    const ev = await record(ctx, "critiquing", "failed", "Missing draft for critique", {
      error: "no_draft",
    });
    return { ok: false, events: [ev], report: null };
  }
  const startedAt = Date.now();
  const started = await record(ctx, "critiquing", "started", "Critique proposed decision draft", {
    functionName: "CritiqueDecision",
  });
  try {
    const input: CritiqueDecisionInput = {
      casePackageJson: JSON.stringify(ctx.casePkg),
      rulesJson: JSON.stringify(ctx.rules),
      draftJson: JSON.stringify(ctx.decisionDraft),
    };
    const report = await ctx.llm.critiqueDecision(input, ctx.signal);
    ctx.bamlCalls += 1;
    const dur = Date.now() - startedAt;
    const completed = await record(
      ctx,
      "critiquing",
      "completed",
      `Critique ${report.passed ? "passed" : "flagged"} (${report.findings.length} finding(s))`,
      {
        functionName: "CritiqueDecision",
        payload: report,
        durationMs: dur,
      },
    );
    return { ok: true, events: [started, completed], report };
  } catch (err) {
    const dur = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const failed = await record(ctx, "critiquing", "failed", `Critique failed: ${message}`, {
      functionName: "CritiqueDecision",
      error: message,
      durationMs: dur,
    });
    return { ok: false, events: [started, failed], report: null };
  }
}

async function emitReviewable(
  ctx: RunContext,
  status: TraceEvent["status"],
  summary: string,
  outcome: "reviewable" | "follow_up" | "escalate" | "error",
  extras: { error?: string | null } = {},
): Promise<TraceEvent> {
  return record(ctx, "reviewable", status, summary, {
    error: extras.error ?? null,
    evidenceRefs: ctx.decisionDraft?.evidenceRefs ?? ctx.rules?.evidenceRefs ?? [],
    payload: {
      outcome,
      draft: ctx.decisionDraft,
      rules: ctx.rules,
      claims: ctx.claims,
      knowledgeCount: ctx.knowledge.length,
    },
  });
}

export async function* runCase(
  caseId: string,
  options: RunCaseOptions = {},
): AsyncGenerator<TraceEvent> {
  const dataDir = resolve(options.dataDir ?? DEFAULT_DATA_DIR);
  const indexPath = options.indexPath ?? DEFAULT_KNOWLEDGE_INDEX;
  const llm: LlmClient = options.llm ?? defaultLlm;
  const runId = ensureRunId(options.runId);
  const signal = options.signal;

  const state = await readState({ dataDir });
  const existing = state.cases.find((c) => c.caseId === caseId);
  if (!existing) {
    throw new PipelineError("case_not_found", `case ${caseId} not found`);
  }

  const priorSameRun = sameRunEvents(state.events, caseId, runId);
  if (priorSameRun.length > 0) {
    for (const ev of priorSameRun) yield ev;
    return;
  }

  const allCaseEvents = state.events.filter((e) => e.caseId === caseId);
  const startSeq = allCaseEvents.reduce((m, e) => (e.sequence > m ? e.sequence : m), 0) + 1;

  const ctx: RunContext = {
    caseId,
    runId,
    signal,
    dataDir,
    indexPath,
    llm,
    memoryClient: options.memoryClient,
    events: [],
    nextSeq: startSeq,
    casePkg: existing.pkg,
    bamlCalls: 0,
    emailDraft: null,
    claims: null,
    rules: null,
    knowledge: [],
    recordRefs: [],
    decisionDraft: null,
    reviseCount: 0,
  };

  await persist(ctx, (s) => {
    const cases = s.cases.map((c) =>
      c.caseId === caseId
        ? { ...c, state: "running" as CaseState, updatedAt: new Date().toISOString() }
        : c,
    );
    return { ...s, cases };
  });

  if (checkAbort(ctx.signal)) {
    const ev = await emitReviewable(ctx, "failed", "Run aborted before start", "error", { error: "aborted" });
    yield ev;
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }
  const email = await generateEmail(ctx);
  for (const e of email.events) yield e;
  if (!email.ok) {
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  if (checkAbort(ctx.signal)) {
    const ev = await emitReviewable(ctx, "failed", "Run aborted", "error", { error: "aborted" });
    yield ev;
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  const claims = await extractClaims(ctx);
  for (const e of claims.events) yield e;
  if (!claims.ok) {
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  if (checkAbort(ctx.signal)) {
    const ev = await emitReviewable(ctx, "failed", "Run aborted", "error", { error: "aborted" });
    yield ev;
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  const lookup = await retrieveAndCheck(ctx);
  for (const e of lookup.events) yield e;
  if (!lookup.ok) {
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  if (checkAbort(ctx.signal)) {
    const ev = await emitReviewable(ctx, "failed", "Run aborted", "error", { error: "aborted" });
    yield ev;
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  const rules = await evaluateRules(ctx);
  for (const e of rules.events) yield e;
  if (!rules.ok) {
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  const memoryContext: MemoryContext = await recallReviewerContext({
    topic: ctx.casePkg.topic,
    query: `${ctx.casePkg.topic} ${ctx.claims?.requestedAction ?? ""}`.trim(),
    client: ctx.memoryClient ?? null,
  });

  const shortCircuit =
    (ctx.claims && ctx.claims.missingFields.length > 0) ||
    ctx.rules?.outcome === "follow_up_required";
  if (shortCircuit) {
    const summary =
      ctx.claims && ctx.claims.missingFields.length > 0
        ? `Follow-up required: ${ctx.claims.missingFields.join(", ")}`
        : "Follow-up required by deterministic rules";
    const ev = await emitReviewable(ctx, "completed", summary, "follow_up");
    yield ev;
    await finalizeCase(ctx, "reviewable", existing.version + 1);
    return;
  }

  if (ctx.rules?.outcome === "escalate") {
    const ev = await emitReviewable(ctx, "completed", "Escalation recommended by deterministic rules", "escalate");
    yield ev;
    await finalizeCase(ctx, "escalated", existing.version + 1);
    return;
  }

  const draft1 = await draftDecisionStage(ctx, memoryContext, false, []);
  for (const e of draft1.events) yield e;
  if (!draft1.ok) {
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  if (checkAbort(ctx.signal)) {
    const ev = await emitReviewable(ctx, "failed", "Run aborted", "error", { error: "aborted" });
    yield ev;
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  const critique1 = await critiqueStage(ctx);
  for (const e of critique1.events) yield e;
  if (!critique1.ok) {
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  let finalReport = critique1.report;
  if (finalReport && !finalReport.passed) {
    const findings = finalReport.findings.map((f) => ({
      severity: f.severity,
      message: f.message,
      evidenceRef: f.evidenceRef ?? null,
    }));
    const draft2 = await draftDecisionStage(ctx, memoryContext, true, findings);
    for (const e of draft2.events) yield e;
    if (!draft2.ok) {
      await finalizeCase(ctx, "error", existing.version + 1);
      return;
    }
    if (checkAbort(ctx.signal)) {
      const ev = await emitReviewable(ctx, "failed", "Run aborted", "error", { error: "aborted" });
      yield ev;
      await finalizeCase(ctx, "error", existing.version + 1);
      return;
    }
    const critique2 = await critiqueStage(ctx);
    for (const e of critique2.events) yield e;
    if (!critique2.ok) {
      await finalizeCase(ctx, "error", existing.version + 1);
      return;
    }
    finalReport = critique2.report;
    if (finalReport && !finalReport.passed) {
      const ev = await emitReviewable(ctx, "completed", "Critic failed twice; escalating", "escalate");
      yield ev;
      await finalizeCase(ctx, "escalated", existing.version + 1);
      return;
    }
  }

  const ev = await emitReviewable(ctx, "completed", "Decision ready for review", "reviewable");
  yield ev;
  await finalizeCase(ctx, "reviewable", existing.version + 1);
}
