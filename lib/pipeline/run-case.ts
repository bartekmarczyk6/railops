import { randomUUID } from "node:crypto";

import { readState, updateState } from "../storage/store.ts";
import type {
  AppState,
  CaseState,
  StoredCase,
  StoredEmail,
  TraceEvent,
} from "../storage/types.ts";
import { evaluateCase } from "../rules/evaluate.ts";
import type { ExtractedClaims as RulesExtractedClaims, RuleEvaluation } from "../rules/types.ts";
import { DEFAULT_INDEX_PATH, searchKnowledge } from "../knowledge/search.ts";
import type { KnowledgeExcerpt } from "../knowledge/types.ts";
import { recallReviewerContext } from "../memory/hindsight.ts";
import type { MemoryContext } from "../memory/types.ts";
import {
  generateCustomerEmail,
  extractCaseClaims,
  draftDecision,
  critiqueDecision,
  streamGenerateCustomerEmail,
  streamDraftDecision,
  rewriteResponseText,
  interpretFollowUp,
  draftFollowUp,
  type GenerateEmailInput,
  type ExtractClaimsInput,
  type DraftDecisionInput,
  type CritiqueDecisionInput,
  type RewriteTextInput,
  type InterpretFollowUpInput,
  type DraftFollowUpInput,
} from "../llm/baml.ts";
import type {
  Claim,
  EmailDraft,
  ExtractedClaims,
  DecisionDraft,
  CritiqueReport,
  FollowUpDraft,
  FollowUpInterpretation,
  FollowUpAnswer,
} from "../llm/types.ts";

import { awaitCaseEmail } from "./email-prep.ts";
import { createEvent, sameRunEvents } from "./events.ts";

export const DEFAULT_DATA_DIR = ".railops/data";
export const DEFAULT_KNOWLEDGE_INDEX = DEFAULT_INDEX_PATH;
export const MAX_BAML_CALLS_PER_RUN = 6;

export { MAX_REVISIONS, MaxRevisionsReached, ReviewError } from "./errors.ts";

export class PipelineError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
  }
}

export type EmailStreamPartial = { subject?: string; body?: string };

export type DecisionStreamPartial = {
  response?: string;
  outcome?: string;
  proposedAmount?: number | null;
};

export type StreamFrame = {
  type: "stream";
  stage: "generating_email" | "drafting";
  partial: Record<string, unknown>;
};

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
  rewriteResponseText?(
    input: RewriteTextInput,
    signal?: AbortSignal,
  ): Promise<{ rewrittenSelection: string }>;
  interpretFollowUp?(
    input: InterpretFollowUpInput,
    signal?: AbortSignal,
  ): Promise<FollowUpInterpretation>;
  draftFollowUp?(
    input: DraftFollowUpInput,
    signal?: AbortSignal,
  ): Promise<FollowUpDraft>;
  streamGenerateCustomerEmail?(
    input: GenerateEmailInput,
    onPartial: (partial: EmailStreamPartial) => void,
    signal?: AbortSignal,
  ): Promise<EmailDraft>;
  streamDraftDecision?(
    input: DraftDecisionInput,
    onPartial: (partial: DecisionStreamPartial) => void,
    signal?: AbortSignal,
  ): Promise<DecisionDraft>;
};

const defaultLlm: LlmClient = {
  generateCustomerEmail: (input, signal) => generateCustomerEmail(input, signal),
  extractCaseClaims: (input, signal) => extractCaseClaims(input, signal),
  draftDecision: (input, signal) => draftDecision(input, signal),
  critiqueDecision: (input, signal) => critiqueDecision(input, signal),
  rewriteResponseText: (input, signal) => rewriteResponseText(input, signal),
  interpretFollowUp: (input, signal) => interpretFollowUp(input, signal),
  draftFollowUp: (input, signal) => draftFollowUp(input, signal),
  streamGenerateCustomerEmail: (input, onPartial, signal) =>
    streamGenerateCustomerEmail(input, onPartial, signal),
  streamDraftDecision: (input, onPartial, signal) =>
    streamDraftDecision(input, onPartial, signal),
};

export type RunCaseOptions = {
  signal?: AbortSignal;
  runId?: string;
  dataDir?: string;
  indexPath?: string;
  llm?: LlmClient;
  memoryClient?: Parameters<typeof recallReviewerContext>[0]["client"];
  onStream?: (frame: StreamFrame) => void;
};

type RunContext = {
  caseId: string;
  runId: string;
  signal: AbortSignal | undefined;
  dataDir: string;
  indexPath: string;
  llm: LlmClient;
  memoryClient: RunCaseOptions["memoryClient"];
  onStream: RunCaseOptions["onStream"];
  events: TraceEvent[];
  nextSeq: number;
  casePkg: StoredCase["pkg"];
  bamlCalls: number;
  storedEmail: StoredEmail | null;
  emailDraft: EmailDraft | null;
  claims: ExtractedClaims | null;
  rules: RuleEvaluation | null;
  knowledge: KnowledgeExcerpt[];
  recordRefs: string[];
  decisionDraft: DecisionDraft | null;
  reviseCount: number;
  supplements: Record<string, string>;
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

function applySupplements(
  claims: ExtractedClaims,
  supplements: Record<string, string>,
): ExtractedClaims {
  const missingFields = [...claims.missingFields];
  const nextClaims = [...claims.claims];
  for (const [field, value] of Object.entries(supplements)) {
    const idx = missingFields.indexOf(field);
    if (idx === -1) continue;
    missingFields.splice(idx, 1);
    const trimmed = value.trim();
    const numeric =
      trimmed.length > 0 && Number.isFinite(Number(trimmed)) ? Number(trimmed) : null;
    const claim: Claim = {
      kind: field,
      description: `${field}: ${value}`,
      value: numeric,
    };
    const existingIdx = nextClaims.findIndex((c) => c.kind === field);
    if (existingIdx >= 0) nextClaims[existingIdx] = claim;
    else nextClaims.push(claim);
  }
  return { ...claims, claims: nextClaims, missingFields };
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

async function readEmailStage(
  ctx: RunContext,
): Promise<{ ok: boolean; events: TraceEvent[] }> {
  if (checkAbort(ctx.signal)) {
    const ev = await record(ctx, "reading_email", "failed", "Run aborted", { error: "aborted" });
    return { ok: false, events: [ev] };
  }
  const startedAt = Date.now();
  const started = await record(ctx, "reading_email", "started", "Read the passenger's email", {
    functionName: "awaitCaseEmail",
  });
  try {
    const email = await awaitCaseEmail(ctx.caseId, { dataDir: ctx.dataDir, llm: ctx.llm });
    ctx.storedEmail = email;
    ctx.emailDraft = {
      subject: email.subject,
      body: email.body,
      mentionedFacts: email.mentionedFacts,
    };
    const dur = Date.now() - startedAt;
    const completed = await record(
      ctx,
      "reading_email",
      "completed",
      `Email from ${email.from}: ${email.subject}`,
      {
        functionName: "awaitCaseEmail",
        payload: email,
        durationMs: dur,
      },
    );
    return { ok: true, events: [started, completed] };
  } catch (err) {
    const dur = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const failed = await record(ctx, "reading_email", "failed", `Reading email failed: ${message}`, {
      functionName: "awaitCaseEmail",
      error: message,
      durationMs: dur,
    });
    return { ok: false, events: [started, failed] };
  }
}

async function locateAccountStage(
  ctx: RunContext,
): Promise<{ ok: boolean; events: TraceEvent[] }> {
  if (checkAbort(ctx.signal)) {
    const ev = await record(ctx, "locating_account", "failed", "Run aborted", { error: "aborted" });
    return { ok: false, events: [ev] };
  }
  const startedAt = Date.now();
  const started = await record(ctx, "locating_account", "started", "Find the passenger by email", {
    functionName: "locateAccount",
  });
  const email = ctx.storedEmail;
  if (!email) {
    const failed = await record(ctx, "locating_account", "failed", "No email stored for case", {
      functionName: "locateAccount",
      error: "no_email",
    });
    return { ok: false, events: [started, failed] };
  }
  const pkg = ctx.casePkg;
  const matchedByEmail = pkg.account.email === email.from;
  const ticketIds = pkg.tickets
    .filter(
      (t) => email.body.includes(t.id) || email.mentionedFacts.includes(`record:ticket:${t.id}`),
    )
    .map((t) => t.id);
  const recordRefs = [
    ...ticketIds.map((id) => `record:ticket:${id}`),
    `record:route:${pkg.route.id}`,
  ];
  const dur = Date.now() - startedAt;
  const summary = `Matched ${pkg.account.fullName} <${pkg.account.email}>${
    ticketIds.length > 0 ? ` · ${ticketIds.length} ticket(s)` : ""
  }`;
  const completed = await record(ctx, "locating_account", "completed", summary, {
    functionName: "locateAccount",
    recordRefs,
    payload: {
      accountId: pkg.account.id,
      accountName: pkg.account.fullName,
      matchedByEmail,
      ticketIds,
    },
    durationMs: dur,
  });
  return { ok: true, events: [started, completed] };
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

async function retrieveKnowledgeStage(
  ctx: RunContext,
): Promise<{ ok: boolean; events: TraceEvent[] }> {
  if (checkAbort(ctx.signal)) {
    const ev = await record(ctx, "retrieving_knowledge", "failed", "Run aborted", { error: "aborted" });
    return { ok: false, events: [ev] };
  }
  const startedAt = Date.now();
  const started = await record(
    ctx,
    "retrieving_knowledge",
    "started",
    "Search knowledge base for relevant passages",
    { functionName: "searchKnowledge" },
  );
  try {
    if (checkAbort(ctx.signal)) {
      throw new PipelineError("aborted", "aborted before knowledge search");
    }
    const terms = [
      ctx.casePkg.topic,
      ctx.casePkg.truthMode,
      ctx.emailDraft?.subject ?? "",
      ...(ctx.claims?.claims.map((c) => c.kind) ?? []),
    ].filter((t) => t.length > 0);
    const knowledge = searchKnowledge(
      { topic: ctx.casePkg.topic, terms, limit: 5 },
      ctx.indexPath,
    );
    ctx.knowledge = knowledge;
    const dur = Date.now() - startedAt;
    const completed = await record(
      ctx,
      "retrieving_knowledge",
      "completed",
      `Retrieved ${knowledge.length} knowledge excerpts`,
      {
        functionName: "searchKnowledge",
        evidenceRefs: knowledgeEvidenceRefs(knowledge),
        payload: { count: knowledge.length, ids: knowledge.map((k) => k.id) },
        durationMs: dur,
      },
    );
    return { ok: true, events: [started, completed] };
  } catch (err) {
    const dur = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const failed = await record(
      ctx,
      "retrieving_knowledge",
      "failed",
      `Knowledge retrieval failed: ${message}`,
      { functionName: "searchKnowledge", error: message, durationMs: dur },
    );
    return { ok: false, events: [started, failed] };
  }
}

async function checkRecordsStage(
  ctx: RunContext,
): Promise<{ ok: boolean; events: TraceEvent[] }> {
  if (checkAbort(ctx.signal)) {
    const ev = await record(ctx, "checking_records", "failed", "Run aborted", { error: "aborted" });
    return { ok: false, events: [ev] };
  }
  const startedAt = Date.now();
  const started = await record(
    ctx,
    "checking_records",
    "started",
    "Inspect synthetic records for evidence references",
    { functionName: "collectRecordRefs" },
  );
  try {
    if (checkAbort(ctx.signal)) {
      throw new PipelineError("aborted", "aborted before record check");
    }
    const recordRefs = recordRefsForPkg(ctx.casePkg);
    ctx.recordRefs = mergeUniqueStrings(ctx.recordRefs, recordRefs);
    const dur = Date.now() - startedAt;
    const completed = await record(
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
    return { ok: true, events: [started, completed] };
  } catch (err) {
    const dur = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const failed = await record(
      ctx,
      "checking_records",
      "failed",
      `Record check failed: ${message}`,
      { functionName: "collectRecordRefs", error: message, durationMs: dur },
    );
    return { ok: false, events: [started, failed] };
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
    ctx.claims = applySupplements(ctx.claims, ctx.supplements);
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
    const onDraftPartial = (partial: DecisionStreamPartial): void => {
      ctx.onStream?.({
        type: "stream",
        stage: "drafting",
        partial: { ...partial },
      });
    };
    if (isRevision && criticFindings.length > 0) {
      const findingsJson = JSON.stringify(criticFindings);
      const revised: DraftDecisionInput = {
        ...baseInput,
        rulesJson: `${baseInput.rulesJson}\n## Critic findings\n${findingsJson}`,
      };
      draft = ctx.llm.streamDraftDecision
        ? await ctx.llm.streamDraftDecision(revised, onDraftPartial, ctx.signal)
        : await ctx.llm.draftDecision(revised, ctx.signal);
      ctx.bamlCalls += 1;
      ctx.reviseCount += 1;
    } else {
      draft = ctx.llm.streamDraftDecision
        ? await ctx.llm.streamDraftDecision(baseInput, onDraftPartial, ctx.signal)
        : await ctx.llm.draftDecision(baseInput, ctx.signal);
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

export type FollowUpTurn = {
  role: "user" | "agent";
  content: string;
};

export type FollowUpConversation = FollowUpTurn[];

const MAX_FOLLOWUP_TURNS = 8;

function asFollowUpConversation(value: unknown): FollowUpConversation {
  if (!Array.isArray(value)) return [];
  const out: FollowUpConversation = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const t = item as Record<string, unknown>;
    const role = t.role;
    const content = t.content;
    if (typeof content !== "string" || content.trim().length === 0) continue;
    if (role !== "user" && role !== "agent") continue;
    out.push({ role, content });
  }
  return out;
}

function readFollowUpConversation(payload: unknown): FollowUpConversation {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return [];
  const p = payload as Record<string, unknown>;
  if (!("conversation" in p)) return [];
  return asFollowUpConversation(p.conversation);
}

function capConversation(turns: FollowUpConversation): FollowUpConversation {
  if (turns.length <= MAX_FOLLOWUP_TURNS) return turns.slice();
  return turns.slice(turns.length - MAX_FOLLOWUP_TURNS);
}

function readPriorConversations(
  events: readonly TraceEvent[],
  currentRunId: string,
): FollowUpConversation {
  let latest: FollowUpConversation = [];
  for (const e of events) {
    if (e.runId === currentRunId) continue;
    if (e.stage !== "reviewable" || e.status !== "completed") continue;
    const turns = readFollowUpConversation(e.payload);
    if (turns.length === 0) continue;
    latest = turns;
  }
  return capConversation(latest);
}

function normalizeField(field: string): string {
  return field.trim();
}

function validateCandidateAnswers(
  claims: ExtractedClaims | null,
  candidates: readonly FollowUpAnswer[],
): { accepted: Record<string, string>; rejected: FollowUpAnswer[] } {
  if (!claims) return { accepted: {}, rejected: [...candidates] };
  const allowed = new Set(claims.missingFields.map(normalizeField));
  const accepted: Record<string, string> = {};
  const rejected: FollowUpAnswer[] = [];
  for (const candidate of candidates) {
    const field = normalizeField(candidate.field);
    const value = candidate.value.trim();
    if (!allowed.has(field) || value.length === 0) {
      rejected.push(candidate);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(accepted, field)) {
      rejected.push(candidate);
      continue;
    }
    accepted[field] = value;
  }
  return { accepted, rejected };
}

async function emitFollowUpStarted(
  ctx: RunContext,
  summary: string,
  conversation: FollowUpConversation,
): Promise<TraceEvent> {
  return record(ctx, "follow_up", "started", summary, {
    functionName: ctx.llm.draftFollowUp ? "DraftFollowUp" : null,
    payload: { conversation },
  });
}

async function emitFollowUpCompleted(
  ctx: RunContext,
  summary: string,
  extras: { conversation: FollowUpConversation; followUp: FollowUpDraft },
): Promise<TraceEvent> {
  return record(ctx, "follow_up", "completed", summary, {
    functionName: ctx.llm.draftFollowUp ? "DraftFollowUp" : null,
    payload: {
      conversation: extras.conversation,
      followUp: extras.followUp,
    },
  });
}

async function emitFollowUpReviewable(
  ctx: RunContext,
  summary: string,
  extras: {
    followUp: FollowUpDraft;
    conversation: FollowUpConversation;
  },
): Promise<TraceEvent> {
  return record(ctx, "reviewable", "completed", summary, {
    evidenceRefs: ctx.rules?.evidenceRefs ?? [],
    payload: {
      outcome: "follow_up",
      draft: null,
      rules: ctx.rules,
      claims: ctx.claims,
      knowledgeCount: ctx.knowledge.length,
      followUp: extras.followUp,
      conversation: extras.conversation,
    },
  });
}

async function generateNextFollowUp(
  ctx: RunContext,
  memoryContext: MemoryContext,
  conversation: FollowUpConversation,
): Promise<{ ok: boolean; events: TraceEvent[]; draft?: FollowUpDraft }> {
  if (!ctx.llm.draftFollowUp) {
    return { ok: false, events: [] };
  }
  const started = await emitFollowUpStarted(ctx, "Drafting the next follow-up", conversation);
  const startedAt = Date.now();
  let draft: FollowUpDraft;
  try {
    const input: DraftFollowUpInput = {
      casePackageJson: JSON.stringify(ctx.casePkg),
      claimsJson: JSON.stringify(ctx.claims),
      rulesJson: JSON.stringify(ctx.rules),
      knowledgeJson: JSON.stringify(ctx.knowledge),
      memoryJson: JSON.stringify(memoryContext),
      conversationJson: JSON.stringify(capConversation(conversation)),
    };
    draft = await ctx.llm.draftFollowUp(input, ctx.signal);
    ctx.bamlCalls += 1;
  } catch (err) {
    const dur = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    const failed = await record(ctx, "follow_up", "failed", `Follow-up draft failed: ${message}`, {
      functionName: "DraftFollowUp",
      error: message,
      durationMs: dur,
    });
    return { ok: false, events: [started, failed] };
  }
  void startedAt;
  const completed = await emitFollowUpCompleted(ctx, "Follow-up drafted", {
    conversation,
    followUp: draft,
  });
  return { ok: true, events: [started, completed], draft };
}

async function* decisionTail(
  ctx: RunContext,
  version: number,
  priorConversation: FollowUpConversation = [],
): AsyncGenerator<TraceEvent> {
  const rules = await evaluateRules(ctx);
  for (const e of rules.events) yield e;
  if (!rules.ok) {
    await finalizeCase(ctx, "error", version);
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
    const reasonSummary =
      ctx.claims && ctx.claims.missingFields.length > 0
        ? `Follow-up required: ${ctx.claims.missingFields.join(", ")}`
        : "Follow-up required by deterministic rules";
    let conversation = capConversation(priorConversation);
    let draft: FollowUpDraft;
    const generated = await generateNextFollowUp(ctx, memoryContext, conversation);
    for (const e of generated.events) yield e;
    if (!generated.ok) {
      await finalizeCase(ctx, "error", version);
      return;
    }
    draft = generated.draft as FollowUpDraft;
    conversation = [...conversation, { role: "agent", content: draft.message }];
    const summary = reasonSummary;
    const ev = await emitFollowUpReviewable(ctx, summary, {
      followUp: draft,
      conversation,
    });
    yield ev;
    await finalizeCase(ctx, "reviewable", version);
    return;
  }

  if (ctx.rules?.outcome === "escalate") {
    const ev = await emitReviewable(ctx, "completed", "Escalation recommended by deterministic rules", "escalate");
    yield ev;
    await finalizeCase(ctx, "escalated", version);
    return;
  }

  const draft1 = await draftDecisionStage(ctx, memoryContext, false, []);
  for (const e of draft1.events) yield e;
  if (!draft1.ok) {
    await finalizeCase(ctx, "error", version);
    return;
  }

  if (checkAbort(ctx.signal)) {
    const ev = await emitReviewable(ctx, "failed", "Run aborted", "error", { error: "aborted" });
    yield ev;
    await finalizeCase(ctx, "error", version);
    return;
  }

  const critique1 = await critiqueStage(ctx);
  for (const e of critique1.events) yield e;
  if (!critique1.ok) {
    await finalizeCase(ctx, "error", version);
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
      await finalizeCase(ctx, "error", version);
      return;
    }
    if (checkAbort(ctx.signal)) {
      const ev = await emitReviewable(ctx, "failed", "Run aborted", "error", { error: "aborted" });
      yield ev;
      await finalizeCase(ctx, "error", version);
      return;
    }
    const critique2 = await critiqueStage(ctx);
    for (const e of critique2.events) yield e;
    if (!critique2.ok) {
      await finalizeCase(ctx, "error", version);
      return;
    }
    finalReport = critique2.report;
    if (finalReport && !finalReport.passed) {
      const ev = await emitReviewable(ctx, "completed", "Critic failed twice; escalating", "escalate");
      yield ev;
      await finalizeCase(ctx, "escalated", version);
      return;
    }
  }

  const ev = await emitReviewable(ctx, "completed", "Decision ready for review", "reviewable");
  yield ev;
  await finalizeCase(ctx, "reviewable", version);
}

function buildContext(
  caseId: string,
  existing: StoredCase,
  runId: string,
  startSeq: number,
  options: RunCaseOptions,
  dataDir: string,
  llm: LlmClient,
): RunContext {
  return {
    caseId,
    runId,
    signal: options.signal,
    dataDir,
    indexPath: options.indexPath ?? DEFAULT_KNOWLEDGE_INDEX,
    llm,
    memoryClient: options.memoryClient,
    onStream: options.onStream,
    events: [],
    nextSeq: startSeq,
    casePkg: existing.pkg,
    bamlCalls: 0,
    storedEmail: null,
    emailDraft: null,
    claims: null,
    rules: null,
    knowledge: [],
    recordRefs: [],
    decisionDraft: null,
    reviseCount: 0,
    supplements: { ...(existing.supplements ?? {}) },
  };
}

export async function* runCase(
  caseId: string,
  options: RunCaseOptions = {},
): AsyncGenerator<TraceEvent> {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const llm: LlmClient = options.llm ?? defaultLlm;
  const runId = ensureRunId(options.runId);

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

  const ctx: RunContext = buildContext(caseId, existing, runId, startSeq, options, dataDir, llm);

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
  const email = await readEmailStage(ctx);
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

  const locate = await locateAccountStage(ctx);
  for (const e of locate.events) yield e;
  if (!locate.ok) {
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

  const knowledge = await retrieveKnowledgeStage(ctx);
  for (const e of knowledge.events) yield e;
  if (!knowledge.ok) {
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  if (checkAbort(ctx.signal)) {
    const ev = await emitReviewable(ctx, "failed", "Run aborted", "error", { error: "aborted" });
    yield ev;
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  const records = await checkRecordsStage(ctx);
  for (const e of records.events) yield e;
  if (!records.ok) {
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  if (checkAbort(ctx.signal)) {
    const ev = await emitReviewable(ctx, "failed", "Run aborted", "error", { error: "aborted" });
    yield ev;
    await finalizeCase(ctx, "error", existing.version + 1);
    return;
  }

  yield* decisionTail(ctx, existing.version + 1);
}

function latestEvent(
  events: readonly TraceEvent[],
  match: (e: TraceEvent) => boolean,
): TraceEvent | null {
  let best: TraceEvent | null = null;
  for (const e of events) {
    if (!match(e)) continue;
    if (best === null || e.sequence > best.sequence) best = e;
  }
  return best;
}

function asExtractedClaims(payload: unknown): ExtractedClaims | null {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.requestedAction !== "string") return null;
  if (!Array.isArray(p.claims) || !Array.isArray(p.missingFields)) return null;
  if (!Array.isArray(p.referencedTicketNumbers) || !Array.isArray(p.referencedStations)) return null;
  return payload as ExtractedClaims;
}

export type ResumeInput = {
  message?: string;
  answers?: Record<string, string>;
};

export async function* resumeCase(
  caseId: string,
  input: ResumeInput | Record<string, string> | undefined,
  options: RunCaseOptions = {},
): AsyncGenerator<TraceEvent> {
  const dataDir = options.dataDir ?? DEFAULT_DATA_DIR;
  const llm: LlmClient = options.llm ?? defaultLlm;
  const runId = ensureRunId(options.runId);

  const normalized: ResumeInput =
    input === undefined
      ? {}
      : typeof input === "object" && !Array.isArray(input) &&
          ("message" in input || "answers" in input)
        ? (input as ResumeInput)
        : { answers: input as Record<string, string> };

  const messageText = normalized.message?.trim() ?? "";
  const answersInput = normalized.answers ?? {};

  const state = await readState({ dataDir });
  const existing = state.cases.find((c) => c.caseId === caseId);
  if (!existing) {
    throw new PipelineError("case_not_found", `case ${caseId} not found`);
  }
  if (existing.state !== "reviewable") {
    throw new PipelineError(
      "invalid_state",
      `case ${caseId} is in state ${existing.state} and cannot be resumed`,
    );
  }
  const caseEvents = state.events.filter((e) => e.caseId === caseId);
  const latestReviewable = latestEvent(caseEvents, (e) => e.stage === "reviewable");
  const outcome =
    latestReviewable !== null &&
    latestReviewable.payload !== null &&
    typeof latestReviewable.payload === "object"
      ? (latestReviewable.payload as { outcome?: unknown }).outcome
      : undefined;
  if (outcome !== "follow_up") {
    throw new PipelineError("invalid_state", `case ${caseId} is not awaiting follow-up answers`);
  }

  const claimsEvent = latestEvent(
    caseEvents,
    (e) => e.stage === "extracting_claims" && e.status === "completed",
  );
  const claims = claimsEvent !== null ? asExtractedClaims(claimsEvent.payload) : null;
  if (claims === null) {
    throw new PipelineError("invalid_state", `case ${caseId} has no prior claims to resume from`);
  }

  const recordsEvent = latestEvent(
    caseEvents,
    (e) => e.stage === "checking_records" && e.status === "completed",
  );
  const startSeq = caseEvents.reduce((m, e) => (e.sequence > m ? e.sequence : m), 0) + 1;
  const priorConversation = readPriorConversations(caseEvents, runId);

  let candidateAnswers: FollowUpAnswer[] = Object.entries(answersInput).map(([field, value]) => ({
    field,
    value,
  }));
  if (messageText.length > 0 && llm.interpretFollowUp) {
    try {
      const interpretation = await llm.interpretFollowUp(
        {
          casePackageJson: JSON.stringify(existing.pkg),
          claimsJson: JSON.stringify(claims),
          conversationJson: JSON.stringify(priorConversation),
          messageText,
        },
        options.signal,
      );
      if (interpretation.intent === "answer") {
        candidateAnswers = interpretation.answers;
      } else {
        candidateAnswers = [];
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new PipelineError(
        "follow_up_interpret_failed",
        `follow-up interpretation failed: ${message}`,
      );
    }
  } else if (messageText.length > 0) {
    candidateAnswers = [];
  }

  const { accepted } = validateCandidateAnswers(claims, candidateAnswers);
  const supplements = { ...(existing.supplements ?? {}), ...accepted };

  const ctx: RunContext = {
    ...buildContext(caseId, existing, runId, startSeq, options, dataDir, llm),
    storedEmail: existing.email,
    emailDraft: existing.email
      ? {
          subject: existing.email.subject,
          body: existing.email.body,
          mentionedFacts: existing.email.mentionedFacts,
        }
      : null,
    claims,
    recordRefs: recordsEvent !== null ? [...recordsEvent.recordRefs] : recordRefsForPkg(existing.pkg),
    supplements,
  };

  const terms = [
    existing.topic,
    existing.truthMode,
    existing.email?.subject ?? "",
    ...claims.claims.map((c) => c.kind),
  ].filter((t) => t.length > 0);
  ctx.knowledge = searchKnowledge(
    { topic: existing.pkg.topic, terms, limit: 5 },
    ctx.indexPath,
  );

  await persist(ctx, (s) => {
    const cases = s.cases.map((c) =>
      c.caseId === caseId
        ? {
            ...c,
            state: "running" as CaseState,
            supplements,
            updatedAt: new Date().toISOString(),
          }
        : c,
    );
    return { ...s, cases };
  });

  const baseConversation: FollowUpConversation = priorConversation.slice();
  if (messageText.length > 0) {
    baseConversation.push({ role: "user", content: messageText });
  }
  yield* decisionTail(ctx, existing.version + 1, baseConversation);
}
